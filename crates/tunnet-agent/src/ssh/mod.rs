//! Destination-side Tunnet SSH server (PTY over mesh QUIC).

mod pty;
mod tee;

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use iroh::endpoint::{Connection, RecvStream, SendStream};
use parking_lot::Mutex;
use tunnet_common::policy::{SshAction, SshEvalCtx, SshPolicyRule, evaluate_ssh};
use tunnet_common::ssh::{
    SSH_CTRL_LITERAL_FF, SSH_CTRL_PREFIX, SSH_CTRL_RESIZE, SshResponseHeader, SshStatus,
};
use tunnet_common::ws::ClientMsg;
use tunnet_core::ssh::{read_request, write_response};
use tunnet_core::{AclEngine, ConnPool, RoutingTable, SignedClient};
use uuid::Uuid;

use self::pty::{PtySession, spawn_pty};
use self::tee::{
    RecorderTarget, RecordingTee, make_meta, recorder_unavailable, resolve_recorder_target,
};
use crate::recorder::RecordingStore;

#[derive(Clone, Default)]
pub struct SshSessionRegistry {
    inner: Arc<Mutex<HashMap<Uuid, ActiveSshSession>>>,
    killed: Arc<Mutex<HashSet<Uuid>>>,
}

struct ActiveSshSession {
    #[allow(dead_code)]
    peer_hex: String,
    #[allow(dead_code)]
    target_user: String,
    killer: Box<dyn portable_pty::ChildKiller + Send + Sync>,
}

impl SshSessionRegistry {
    pub fn insert(
        &self,
        id: Uuid,
        peer_hex: String,
        target_user: String,
        killer: Box<dyn portable_pty::ChildKiller + Send + Sync>,
    ) {
        self.inner.lock().insert(
            id,
            ActiveSshSession {
                peer_hex,
                target_user,
                killer,
            },
        );
    }

    pub fn remove(&self, id: &Uuid) {
        self.inner.lock().remove(id);
    }

    pub fn kill(&self, id: &Uuid) -> bool {
        let mut guard = self.inner.lock();
        if let Some(mut session) = guard.remove(id) {
            self.killed.lock().insert(*id);
            let _ = session.killer.kill();
            true
        } else {
            false
        }
    }

    pub fn take_killed(&self, id: &Uuid) -> bool {
        self.killed.lock().remove(id)
    }
}

pub struct SshServeDeps {
    pub routes: RoutingTable,
    pub acl: AclEngine,
    pub sessions: SshSessionRegistry,
    pub cp_tx: Option<tokio::sync::mpsc::Sender<ClientMsg>>,
    pub pool: ConnPool,
    pub store: Option<Arc<RecordingStore>>,
    pub signed: Option<SignedClient>,
    pub hostname: String,
    pub network_name: String,
    pub self_endpoint_id: String,
}

pub async fn serve_ssh_connection(conn: Connection, deps: SshServeDeps) {
    let peer = conn.remote_id();
    let peer_hex = format!("{peer}");
    loop {
        let (send, recv) = match conn.accept_bi().await {
            Ok(pair) => pair,
            Err(e) => {
                tracing::debug!(%peer_hex, ?e, "ssh accept_bi closed");
                break;
            }
        };
        let deps = SshServeDeps {
            routes: deps.routes.clone(),
            acl: deps.acl.clone(),
            sessions: deps.sessions.clone(),
            cp_tx: deps.cp_tx.clone(),
            pool: deps.pool.clone(),
            store: deps.store.clone(),
            signed: deps.signed.clone(),
            hostname: deps.hostname.clone(),
            network_name: deps.network_name.clone(),
            self_endpoint_id: deps.self_endpoint_id.clone(),
        };
        let peer_hex = peer_hex.clone();
        tokio::spawn(async move {
            if let Err(e) = handle_ssh_stream(send, recv, peer_hex, deps).await {
                tracing::debug!(?e, "ssh stream ended");
            }
        });
    }
}

async fn handle_ssh_stream(
    mut send: SendStream,
    mut recv: RecvStream,
    peer_hex: String,
    deps: SshServeDeps,
) -> anyhow::Result<()> {
    let SshServeDeps {
        routes,
        acl,
        sessions,
        cp_tx,
        pool,
        store,
        signed,
        hostname,
        network_name,
        self_endpoint_id: _,
    } = deps;

    let req = read_request(&mut recv).await?;
    tracing::info!(
        %peer_hex,
        user = %req.target_user,
        term = %req.term_type,
        "ssh request"
    );

    let peer_info = routes.lookup_endpoint(&peer_hex);
    let empty: Vec<String> = Vec::new();
    let self_id = acl.self_id.load();
    let ctx = SshEvalCtx {
        src_endpoint_hex: &peer_hex,
        src_tags: peer_info
            .as_ref()
            .map(|p| p.tags.as_slice())
            .unwrap_or(&empty),
        src_network: &self_id.network,
        dst_endpoint_hex: &self_id.endpoint_hex,
        dst_tags: &self_id.tags,
        dst_network: &self_id.network,
        requested_user: &req.target_user,
        local_user: &req.local_user,
    };

    let decision: Option<SshPolicyRule> = {
        let bundle = acl.bundle.load();
        evaluate_ssh(&bundle.ssh_rules, &ctx).cloned()
    };
    let recorded = decision.as_ref().is_some_and(|r| r.record);
    let enforce_recorder = decision.as_ref().is_some_and(|r| r.enforce_recorder);
    let recorder_selector = decision.as_ref().and_then(|r| r.recorder.clone());
    let check_period_secs = decision
        .as_ref()
        .filter(|r| r.action == SshAction::Check)
        .and_then(|r| r.check_period_secs)
        .unwrap_or(3600);

    match decision.as_ref() {
        None => {
            write_response(
                &mut send,
                &SshResponseHeader::denied(format!(
                    "Access denied. Your identity ({}{}) is not permitted SSH access as {}.",
                    peer_info
                        .as_ref()
                        .map(|p| p.hostname.as_str())
                        .unwrap_or(&peer_hex),
                    format_tags(peer_info.as_ref().map(|p| p.tags.as_slice()).unwrap_or(&[])),
                    req.target_user
                )),
            )
            .await?;
            return Ok(());
        }
        Some(rule) if rule.action == SshAction::Deny => {
            write_response(
                &mut send,
                &SshResponseHeader::denied(format!(
                    "Access denied. SSH to this machine as {} is explicitly denied.",
                    req.target_user
                )),
            )
            .await?;
            return Ok(());
        }
        Some(rule) if rule.action == SshAction::Check => {
            let Some(client) = signed.as_ref() else {
                write_response(
                    &mut send,
                    &SshResponseHeader::denied(
                        "check-mode SSH requires control plane connectivity",
                    ),
                )
                .await?;
                return Ok(());
            };
            let period = rule.check_period_secs.unwrap_or(check_period_secs);
            let verified = client
                .verify_ssh_auth(&peer_hex, period, req.auth_token.as_deref())
                .await;
            match verified {
                Ok(v) if v.get("status").and_then(|s| s.as_str()) == Some("ok") => {
                    tracing::info!(%peer_hex, "ssh check-mode auth ok");
                }
                Ok(_) | Err(_) => {
                    // Fresh evaluate to mint challenge / URL for the client.
                    let eval = match client.evaluate_ssh_auth(&peer_hex, period).await {
                        Ok(v) => v,
                        Err(e) => {
                            tracing::warn!(?e, "ssh auth evaluate failed");
                            write_response(
                                &mut send,
                                &SshResponseHeader::denied(
                                    "unable to verify re-authentication with control plane",
                                ),
                            )
                            .await?;
                            return Ok(());
                        }
                    };
                    if eval.get("status").and_then(|s| s.as_str()) == Some("ok") {
                        // Race: became fresh between verify and evaluate.
                    } else {
                        let url = eval
                            .get("reauthUrl")
                            .and_then(|u| u.as_str())
                            .unwrap_or("")
                            .to_string();
                        write_response(
                            &mut send,
                            &SshResponseHeader::reauth_required(
                                url,
                                format!(
                                    "Re-authentication required for {} access.",
                                    req.target_user
                                ),
                            ),
                        )
                        .await?;
                        return Ok(());
                    }
                }
            }
        }
        Some(_) => {}
    }

    let session_id = Uuid::new_v4();
    let mut tee: Option<RecordingTee> = None;
    if recorded {
        let target = resolve_recorder_target(&routes, &acl, recorder_selector.as_ref());
        match target {
            None => {
                let resp = recorder_unavailable(enforce_recorder);
                if resp.status != SshStatus::Ok as u8 {
                    write_response(&mut send, &resp).await?;
                    return Ok(());
                }
                tracing::warn!(%peer_hex, "recorder unavailable; continuing without recording");
            }
            Some(RecorderTarget::Local) => {
                if let Some(store) = store.as_ref() {
                    let meta = make_meta(
                        &session_id.to_string(),
                        &peer_hex,
                        peer_info.as_ref().map(|p| p.hostname.clone()),
                        &req.target_user,
                        &hostname,
                        &network_name,
                        req.width,
                        req.height,
                        &req.term_type,
                    );
                    match RecordingTee::local(store, &meta) {
                        Ok(t) => tee = Some(t),
                        Err(e) => {
                            tracing::warn!(?e, "failed to open local recording");
                            let resp = recorder_unavailable(enforce_recorder);
                            if resp.status != SshStatus::Ok as u8 {
                                write_response(&mut send, &resp).await?;
                                return Ok(());
                            }
                        }
                    }
                } else {
                    let resp = recorder_unavailable(enforce_recorder);
                    if resp.status != SshStatus::Ok as u8 {
                        write_response(&mut send, &resp).await?;
                        return Ok(());
                    }
                    tracing::warn!(
                        %peer_hex,
                        "local recording store missing; continuing without recording"
                    );
                }
            }
            Some(RecorderTarget::Remote(peer)) => {
                let meta = make_meta(
                    &session_id.to_string(),
                    &peer_hex,
                    peer_info.as_ref().map(|p| p.hostname.clone()),
                    &req.target_user,
                    &hostname,
                    &network_name,
                    req.width,
                    req.height,
                    &req.term_type,
                );
                match RecordingTee::remote(&pool, peer, meta).await {
                    Ok(t) => tee = Some(t),
                    Err(e) => {
                        tracing::warn!(?e, "failed to dial recorder");
                        let resp = recorder_unavailable(enforce_recorder);
                        if resp.status != SshStatus::Ok as u8 {
                            write_response(&mut send, &resp).await?;
                            return Ok(());
                        }
                    }
                }
            }
        }
    }

    let actually_recorded = tee.is_some();
    let started = std::time::Instant::now();
    let pty = match spawn_pty(&req) {
        Ok(p) => p,
        Err(e) => {
            tracing::warn!(%peer_hex, ?e, "pty spawn failed");
            let msg = e.to_string();
            let resp = if msg.contains("not found") {
                SshResponseHeader::user_not_found(&req.target_user)
            } else {
                SshResponseHeader {
                    status: SshStatus::Denied as u8,
                    reauth_url: None,
                    message: Some(format!("failed to start session: {msg}")),
                }
            };
            write_response(&mut send, &resp).await?;
            return Ok(());
        }
    };

    write_response(&mut send, &SshResponseHeader::ok()).await?;

    if let Some(tx) = &cp_tx {
        let _ = tx.try_send(ClientMsg::SshSessionStarted {
            session_id: session_id.to_string(),
            src_endpoint_id: peer_hex.clone(),
            target_user: req.target_user.clone(),
            src_hostname: peer_info.as_ref().map(|p| p.hostname.clone()),
            recorded: actually_recorded,
        });
    }

    let PtySession {
        mut reader,
        mut writer,
        mut child_killer,
        master,
    } = pty;

    sessions.insert(
        session_id,
        peer_hex.clone(),
        req.target_user.clone(),
        child_killer.clone_killer(),
    );

    let (pty_out_tx, mut pty_out_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(256);
    let (pty_in_tx, pty_in_rx) = std::sync::mpsc::channel::<Vec<u8>>();
    let (resize_tx, resize_rx) = std::sync::mpsc::channel::<(u16, u16)>();

    std::thread::spawn(move || {
        let mut buf = [0u8; 16 * 1024];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    if pty_out_tx.blocking_send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    std::thread::spawn(move || {
        while let Ok(chunk) = pty_in_rx.recv() {
            if writer.write_all(&chunk).is_err() {
                break;
            }
            let _ = writer.flush();
        }
    });

    let master_for_resize = master;
    let resize_tee = Arc::new(Mutex::new(None::<(u16, u16)>));
    let resize_tee_thread = resize_tee.clone();
    std::thread::spawn(move || {
        while let Ok((cols, rows)) = resize_rx.recv() {
            let _ = master_for_resize.resize(portable_pty::PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            });
            *resize_tee_thread.lock() = Some((cols, rows));
        }
    });

    let up = async {
        let mut buf = vec![0u8; 16 * 1024];
        let mut pending = Vec::new();
        loop {
            let n = match recv.read(&mut buf).await? {
                Some(n) => n,
                None => break,
            };
            pending.extend_from_slice(&buf[..n]);
            let (to_pty, rest) = decode_client_bytes(&pending, &resize_tx);
            pending = rest;
            if !to_pty.is_empty() && pty_in_tx.send(to_pty).is_err() {
                break;
            }
        }
        Ok::<_, anyhow::Error>(())
    };

    let mut tee = tee;
    let down = async {
        while let Some(chunk) = pty_out_rx.recv().await {
            if let Some((cols, rows)) = resize_tee.lock().take()
                && let Some(t) = tee.as_mut()
                && let Err(e) = t.write_resize(cols, rows)
            {
                tracing::warn!(?e, "recording resize failed");
                if enforce_recorder {
                    anyhow::bail!("recording failed and enforce_recorder is set");
                }
                tee = None;
            }
            if let Some(t) = tee.as_mut()
                && let Err(e) = t.write_output(&chunk)
            {
                tracing::warn!(?e, "recording write failed");
                if enforce_recorder {
                    anyhow::bail!("recording failed and enforce_recorder is set");
                }
                tee = None;
            }
            send.write_all(&chunk).await?;
        }
        send.finish().ok();
        Ok::<_, anyhow::Error>(())
    };

    let result = tokio::select! {
        r = up => r,
        r = down => r,
    };

    sessions.remove(&session_id);
    let killed = sessions.take_killed(&session_id);
    let _ = child_killer.kill();
    let duration_ms = started.elapsed().as_millis() as u64;

    if let Some(t) = tee {
        match t.finish(store.as_deref(), duration_ms) {
            Ok(Some((meta, finalized))) => {
                if let Some(tx) = &cp_tx {
                    let _ = tx.try_send(ClientMsg::SshRecordingSaved {
                        session_id: meta.session_id.clone(),
                        recorder_endpoint_id: acl.self_id.load().endpoint_hex.clone(),
                        duration_ms: Some(duration_ms),
                        byte_size: finalized.byte_size,
                        content_sha256: finalized.sha256_hex.clone(),
                    });
                }
                if let Some(client) = &signed {
                    match std::fs::read_to_string(&finalized.path) {
                        Ok(cast_text) => {
                            if let Err(e) = client
                                .upload_ssh_recording(
                                    &meta.session_id,
                                    &cast_text,
                                    &finalized.sha256_hex,
                                )
                                .await
                            {
                                tracing::warn!(?e, "failed to upload local recording");
                            }
                        }
                        Err(e) => tracing::warn!(?e, "failed to read local cast for upload"),
                    }
                }
            }
            Ok(None) => {}
            Err(e) => tracing::warn!(?e, "failed to finalize recording"),
        }
    }

    if let Some(tx) = &cp_tx {
        let _ = tx.try_send(ClientMsg::SshSessionEnded {
            session_id: session_id.to_string(),
            status: if killed {
                "killed".into()
            } else {
                "ended".into()
            },
            duration_ms: Some(duration_ms),
        });
    }
    result
}

fn format_tags(tags: &[String]) -> String {
    if tags.is_empty() {
        String::new()
    } else {
        format!(" / tag:{}", tags.join(","))
    }
}

/// Decode client→server bytes: extract resize controls, unescape `0xFF`.
fn decode_client_bytes(
    input: &[u8],
    resize_tx: &std::sync::mpsc::Sender<(u16, u16)>,
) -> (Vec<u8>, Vec<u8>) {
    let mut out = Vec::with_capacity(input.len());
    let mut i = 0;
    while i < input.len() {
        if input[i] != SSH_CTRL_PREFIX {
            out.push(input[i]);
            i += 1;
            continue;
        }
        if i + 1 >= input.len() {
            return (out, input[i..].to_vec());
        }
        match input[i + 1] {
            SSH_CTRL_LITERAL_FF => {
                out.push(SSH_CTRL_PREFIX);
                i += 2;
            }
            SSH_CTRL_RESIZE => {
                if i + 6 > input.len() {
                    return (out, input[i..].to_vec());
                }
                let width = u16::from_be_bytes([input[i + 2], input[i + 3]]);
                let height = u16::from_be_bytes([input[i + 4], input[i + 5]]);
                let _ = resize_tx.send((width, height));
                i += 6;
            }
            _ => {
                i += 2;
            }
        }
    }
    (out, Vec::new())
}

use std::io::{Read, Write};
