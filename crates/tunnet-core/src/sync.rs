use std::sync::Arc;
use std::time::Duration;

use anyhow::Context;
use arc_swap::ArcSwap;
use tunnet_common::ws::{ClientMsg, ServerMsg};
use tunnet_common::{EndpointSnapshot, NetworkMembershipSnapshot};
use uuid::Uuid;

use crate::acl::AclEngine;
use crate::control::SignedClient;
use crate::routing::RoutingTable;
use crate::state::{StatePaths, save_snapshot_cache};
use crate::ws_client::WsChannel;

pub fn membership_for_network(
    snap: &EndpointSnapshot,
    network_id: Uuid,
) -> anyhow::Result<&NetworkMembershipSnapshot> {
    snap.memberships
        .iter()
        .find(|m| m.network_id == network_id)
        .with_context(|| format!("network {network_id} not in snapshot"))
}

pub fn apply_membership(
    membership: &NetworkMembershipSnapshot,
    routes: &RoutingTable,
    acl: &AclEngine,
    version: &Arc<ArcSwap<u64>>,
    org_version: u64,
    self_endpoint_id: &str,
    self_hostname: &str,
) {
    // Control plane excludes this endpoint from ipv4_peers (no mesh self-route).
    // Inject self so PeerDNS can resolve our own hostname → assigned mesh IP.
    let hostname = if !membership.self_hostname.is_empty() {
        membership.self_hostname.as_str()
    } else {
        self_hostname
    };
    let mut peers = Vec::with_capacity(membership.ipv4_peers.len() + 1);
    peers.extend_from_slice(&membership.ipv4_peers);
    if !hostname.is_empty() && !peers.iter().any(|p| p.endpoint_id == self_endpoint_id) {
        peers.push(tunnet_common::PeerEntry {
            ip: membership.assigned_ipv4,
            endpoint_id: self_endpoint_id.to_string(),
            hostname: hostname.to_string(),
            tags: membership.self_tags.clone(),
        });
    }

    routes.replace(
        &peers,
        &membership.subnet_routes,
        &membership.hostname_routes,
        &membership.exit_nodes,
        &membership.device_profile,
        &membership.dns,
        &membership.network_name,
        membership.network_id,
        self_endpoint_id,
        membership.version,
    );
    acl.replace_bundle(membership.policy.clone());
    acl.replace_self_tags(membership.self_tags.clone());
    version.store(Arc::new(org_version));
}

pub struct SyncHandles {
    pub version: Arc<ArcSwap<u64>>,
}

#[allow(clippy::too_many_arguments)]
pub fn spawn_ws_processor(
    mut ws: WsChannel,
    routes: RoutingTable,
    acl: AclEngine,
    version: Arc<ArcSwap<u64>>,
    paths: StatePaths,
    network_id: Uuid,
    self_endpoint_id: String,
    self_hostname: String,
    agent_version: &'static str,
    poll_client: Option<SignedClient>,
    serves: Option<crate::serve::ServeManager>,
    tunnels: Option<crate::tunnel::TunnelManager>,
    send: Option<crate::send::SendManager>,
    on_kill_ssh: Option<crate::node::KillSshHook>,
) {
    tokio::spawn(async move {
        let _ = ws
            .tx
            .send(ClientMsg::Hello {
                endpoint_id: "self".into(),
                agent_version: agent_version.into(),
                known_version: **version.load(),
            })
            .await;

        let mut heartbeat = tokio::time::interval(Duration::from_secs(30));
        loop {
            tokio::select! {
                Some(msg) = ws.rx.recv() => {
                    match msg {
                        ServerMsg::Snapshot(snap) => {
                            if let Ok(m) = membership_for_network(&snap, network_id) {
                                apply_membership(
                                    m,
                                    &routes,
                                    &acl,
                                    &version,
                                    snap.version,
                                    &self_endpoint_id,
                                    &self_hostname,
                                );
                                save_snapshot_cache(&paths, &snap).ok();
                                tracing::info!(
                                    v = m.version,
                                    peers = m.ipv4_peers.len(),
                                    subnet_routes = m.subnet_routes.len(),
                                    hostname_routes = m.hostname_routes.len(),
                                    "snapshot from ws"
                                );
                            }
                        }
                        ServerMsg::Delta(delta) => {
                            tracing::info!(v = delta.version, added = delta.added.len(),
                                removed = delta.removed.len(), "delta received");
                            version.store(Arc::new(delta.version));
                        }
                        ServerMsg::Policy(bundle) => acl.replace_bundle(bundle),
                        ServerMsg::ForceReenroll { reason } => {
                            tracing::error!(%reason, "control plane requested re-enrollment");
                            break;
                        }
                        ServerMsg::Ping { nonce } => {
                            let _ = ws.tx.send(ClientMsg::Pong { nonce }).await;
                            if let Some(client) = &poll_client {
                                match client.poll(**version.load()).await {
                                    Ok(snap) => {
                                        if let Ok(m) = membership_for_network(&snap, network_id)
                                            && (snap.version != **version.load()
                                                || m.version != routes.version())
                                        {
                                            apply_membership(
                                                m,
                                                &routes,
                                                &acl,
                                                &version,
                                                snap.version,
                                                &self_endpoint_id,
                                                &self_hostname,
                                            );
                                            save_snapshot_cache(&paths, &snap).ok();
                                            tracing::info!(
                                                v = m.version,
                                                "snapshot from ping wake-up poll"
                                            );
                                        }
                                    }
                                    Err(e) => {
                                        tracing::warn!(?e, "ping wake-up poll failed");
                                    }
                                }
                            }
                        }
                        ServerMsg::StartServe {
                            serve_id,
                            port,
                            protocol,
                            internal_hostname,
                            certificate_pem,
                            private_key_pem,
                            access_mode,
                            allowed_tags,
                            allowed_endpoint_ids,
                        } => {
                            let result = if let Some(mgr) = &serves {
                                mgr.start(
                                    serve_id.clone(),
                                    port,
                                    &protocol,
                                    &internal_hostname,
                                    certificate_pem.as_deref(),
                                    private_key_pem.as_deref(),
                                    crate::serve::ServeAcl {
                                        access_mode,
                                        allowed_tags,
                                        allowed_endpoint_ids,
                                    },
                                )
                                .await
                            } else {
                                Err(anyhow::anyhow!("serve manager not available"))
                            };
                            match result {
                                Ok(_) => {
                                    let _ = ws.tx.send(ClientMsg::ServeReady { serve_id }).await;
                                }
                                Err(e) => {
                                    tracing::warn!(?e, %serve_id, "StartServe failed");
                                    let _ = ws
                                        .tx
                                        .send(ClientMsg::ServeFailed {
                                            serve_id,
                                            error: e.to_string(),
                                        })
                                        .await;
                                }
                            }
                        }
                        ServerMsg::StopServe { serve_id } => {
                            if let Some(mgr) = &serves {
                                let port = mgr
                                    .list()
                                    .into_iter()
                                    .find(|s| s.id == serve_id)
                                    .map(|s| s.port);
                                if let Some(port) = port {
                                    let _ = mgr.stop(port);
                                }
                            }
                            let _ = ws.tx.send(ClientMsg::ServeStopped { serve_id }).await;
                        }
                        ServerMsg::OpenTunnel {
                            tunnel_id,
                            relay_addr,
                            subdomain,
                            public_hostname,
                            local_port,
                            protocol,
                            auth_token,
                            redirect_rules,
                        } => {
                            let result = if let Some(mgr) = &tunnels {
                                mgr.start(
                                    tunnel_id.clone(),
                                    &relay_addr,
                                    &subdomain,
                                    &public_hostname,
                                    local_port,
                                    &protocol,
                                    &auth_token,
                                    redirect_rules,
                                )
                                .await
                            } else {
                                Err(anyhow::anyhow!("tunnel manager not available"))
                            };
                            match result {
                                Ok(info) => {
                                    tracing::info!(url = %info.public_url, "OpenTunnel active");
                                    let _ = ws.tx.send(ClientMsg::TunnelReady { tunnel_id }).await;
                                }
                                Err(e) => {
                                    tracing::warn!(?e, %tunnel_id, "OpenTunnel failed");
                                    let _ = ws
                                        .tx
                                        .send(ClientMsg::TunnelFailed {
                                            tunnel_id,
                                            error: e.to_string(),
                                        })
                                        .await;
                                }
                            }
                        }
                        ServerMsg::StopTunnel { tunnel_id } => {
                            if let Some(mgr) = &tunnels {
                                let _ = mgr.stop(&tunnel_id);
                            }
                            let _ = ws.tx.send(ClientMsg::TunnelStopped { tunnel_id }).await;
                        }
                        ServerMsg::KillSshSession { session_id } => {
                            if let Some(hook) = &on_kill_ssh {
                                hook(&session_id);
                                tracing::info!(%session_id, "KillSshSession handled");
                            } else {
                                tracing::warn!(%session_id, "KillSshSession ignored (no hook)");
                            }
                        }
                        ServerMsg::SendFile {
                            transfer_id,
                            path,
                            target,
                            message,
                        } => {
                            if let Some(mgr) = &send {
                                let path = std::path::PathBuf::from(path);
                                match mgr
                                    .send_file_with_id(
                                        &path,
                                        &target,
                                        message,
                                        Some(transfer_id.clone()),
                                    )
                                    .await
                                {
                                    Ok(_) => {
                                        tracing::info!(%transfer_id, "SendFile started");
                                    }
                                    Err(e) => {
                                        tracing::warn!(?e, %transfer_id, "SendFile failed");
                                        let _ = ws
                                            .tx
                                            .send(ClientMsg::TransferFailed {
                                                transfer_id,
                                                error: e.to_string(),
                                                rejected: false,
                                            })
                                            .await;
                                    }
                                }
                            }
                        }
                        ServerMsg::AcceptTransfer { transfer_id } => {
                            if let Some(mgr) = &send
                                && let Err(e) = mgr.accept_pending(&transfer_id).await
                            {
                                tracing::warn!(?e, %transfer_id, "AcceptTransfer failed");
                            }
                        }
                        ServerMsg::RejectTransfer {
                            transfer_id,
                            reason,
                        } => {
                            if let Some(mgr) = &send
                                && let Err(e) = mgr.reject_pending(&transfer_id, reason).await
                            {
                                tracing::warn!(?e, %transfer_id, "RejectTransfer failed");
                            }
                        }
                        ServerMsg::SetSendConsent {
                            mode,
                            inbox_path,
                            pin_blobs,
                        } => {
                            if let Some(mgr) = &send {
                                let mut cfg = mgr.config();
                                if let Some(m) =
                                    tunnet_common::send::SendConsentMode::parse(&mode)
                                {
                                    cfg.consent = m;
                                }
                                if let Some(p) = inbox_path {
                                    cfg.inbox_path = std::path::PathBuf::from(p);
                                }
                                cfg.pin_blobs = pin_blobs;
                                mgr.set_config(cfg);
                                tracing::info!(%mode, "SetSendConsent applied");
                            }
                        }
                    }
                }
                _ = heartbeat.tick() => {
                    let _ = ws.tx.send(ClientMsg::Heartbeat {
                        active_conns: 0, bytes_tx: 0, bytes_rx: 0,
                    }).await;
                }
            }
        }
    });
}

#[allow(clippy::too_many_arguments)]
pub fn spawn_poll_fallback(
    client: SignedClient,
    version: Arc<ArcSwap<u64>>,
    poll_secs: u64,
    routes: RoutingTable,
    acl: AclEngine,
    network_id: Uuid,
    self_endpoint_id: String,
    self_hostname: String,
) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(poll_secs));
        ticker.tick().await;
        loop {
            ticker.tick().await;
            match client.poll(**version.load()).await {
                Ok(snap) => {
                    if let Ok(m) = membership_for_network(&snap, network_id)
                        && (snap.version != **version.load() || m.version != routes.version())
                    {
                        apply_membership(
                            m,
                            &routes,
                            &acl,
                            &version,
                            snap.version,
                            &self_endpoint_id,
                            &self_hostname,
                        );
                        tracing::info!(
                            v = m.version,
                            peers = m.ipv4_peers.len(),
                            subnet_routes = m.subnet_routes.len(),
                            hostname_routes = m.hostname_routes.len(),
                            "snapshot via poll"
                        );
                    }
                }
                Err(e) => {
                    acl.mark_stale();
                    tracing::warn!(?e, "poll failed");
                }
            }
        }
    });
}
