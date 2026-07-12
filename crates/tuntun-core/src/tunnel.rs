//! Agent-side reverse tunnel manager — dials a public relay over iroh and
//! forwards relay-opened streams to localhost.

use std::collections::HashMap;
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, bail};
use iroh::EndpointId;
use iroh::endpoint::{Connection, RecvStream, SendStream};
use parking_lot::Mutex;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::sync::oneshot;
use tuntun_common::RELAY_ALPN;
use tuntun_common::RedirectRule;
use tuntun_common::match_redirect;
use tuntun_common::relay::RelayCtrl;

use crate::ipc::protocol::TunnelInfo;
use crate::iroh_pool::ConnPool;
use crate::stream::splice_bidirectional;

#[derive(Clone)]
pub struct TunnelManager {
    pool: ConnPool,
    inner: Arc<Mutex<Inner>>,
}

struct Inner {
    tunnels: HashMap<String, ActiveTunnel>,
}

struct ActiveTunnel {
    info: TunnelInfo,
    #[allow(dead_code)]
    redirect_rules: Vec<RedirectRule>,
    stop: Option<oneshot::Sender<()>>,
}

impl TunnelManager {
    pub fn new(pool: ConnPool) -> Self {
        Self {
            pool,
            inner: Arc::new(Mutex::new(Inner {
                tunnels: HashMap::new(),
            })),
        }
    }

    pub fn list(&self) -> Vec<TunnelInfo> {
        self.inner
            .lock()
            .tunnels
            .values()
            .map(|t| t.info.clone())
            .collect()
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn start(
        &self,
        tunnel_id: String,
        relay_endpoint_hex: &str,
        subdomain: &str,
        public_hostname: &str,
        local_port: u16,
        protocol: &str,
        auth_token: &str,
        redirect_rules: Vec<RedirectRule>,
    ) -> anyhow::Result<TunnelInfo> {
        {
            let guard = self.inner.lock();
            if let Some(active) = guard.tunnels.get(&tunnel_id) {
                // Idempotent: reconnect OpenTunnel replay must not double-register.
                tracing::debug!(%tunnel_id, "tunnel already active — skipping start");
                return Ok(active.info.clone());
            }
        }

        let peer: EndpointId = relay_endpoint_hex
            .parse()
            .with_context(|| format!("invalid relay endpoint id: {relay_endpoint_hex}"))?;

        let conn = self
            .pool
            .get_alpn(peer, RELAY_ALPN)
            .await
            .context("connect to relay")?;

        let (mut send, recv) = conn.open_bi().await.context("open control stream")?;
        let register = RelayCtrl::Register {
            tunnel_id: tunnel_id.clone(),
            subdomain: subdomain.to_string(),
            auth_token: auth_token.to_string(),
            local_port,
            protocol: protocol.to_string(),
        };
        send.write_all(&register.to_line()?).await?;

        let mut reader = BufReader::new(recv);
        let mut line = String::new();
        tokio::time::timeout(Duration::from_secs(10), reader.read_line(&mut line))
            .await
            .context("relay auth timeout")??;
        match RelayCtrl::from_line(&line)? {
            RelayCtrl::Ok => {}
            RelayCtrl::Error { message } => bail!("relay rejected tunnel: {message}"),
            other => bail!("unexpected relay response: {other:?}"),
        }

        let public_url = if protocol == "tcp" {
            format!("{public_hostname}:{local_port}")
        } else {
            format!("https://{public_hostname}")
        };

        let info = TunnelInfo {
            id: tunnel_id.clone(),
            port: local_port,
            protocol: protocol.to_string(),
            public_url: public_url.clone(),
            relay: public_hostname.to_string(),
            status: "active".into(),
        };

        let (stop_tx, stop_rx) = oneshot::channel();
        let mgr = self.clone();
        let tid = tunnel_id.clone();
        let control_send = send;
        let rules = redirect_rules.clone();
        let proto = protocol.to_string();
        tokio::spawn(async move {
            if let Err(e) = run_tunnel_session(
                conn,
                control_send,
                reader,
                local_port,
                proto,
                rules,
                stop_rx,
            )
            .await
            {
                tracing::warn!(?e, tunnel_id = %tid, "tunnel session ended");
            }
            mgr.inner.lock().tunnels.remove(&tid);
        });

        self.inner.lock().tunnels.insert(
            tunnel_id,
            ActiveTunnel {
                info: info.clone(),
                redirect_rules,
                stop: Some(stop_tx),
            },
        );

        tracing::info!(%public_url, local_port, "tunnel active");
        Ok(info)
    }

    pub fn stop(&self, id: &str) -> anyhow::Result<TunnelInfo> {
        let mut guard = self.inner.lock();
        let Some(mut active) = guard.tunnels.remove(id) else {
            bail!("no active tunnel with id {id}");
        };
        if let Some(tx) = active.stop.take() {
            let _ = tx.send(());
        }
        active.info.status = "stopped".into();
        Ok(active.info)
    }

    pub fn stop_by_port(&self, port: u16) -> anyhow::Result<TunnelInfo> {
        let id = {
            let guard = self.inner.lock();
            guard
                .tunnels
                .values()
                .find(|t| t.info.port == port)
                .map(|t| t.info.id.clone())
                .ok_or_else(|| anyhow::anyhow!("no active tunnel on port {port}"))?
        };
        self.stop(&id)
    }
}

async fn run_tunnel_session(
    conn: Connection,
    mut control_send: SendStream,
    mut control_recv: BufReader<RecvStream>,
    local_port: u16,
    protocol: String,
    redirect_rules: Vec<RedirectRule>,
    mut stop: oneshot::Receiver<()>,
) -> anyhow::Result<()> {
    let mut ping = tokio::time::interval(Duration::from_secs(20));

    loop {
        tokio::select! {
            _ = &mut stop => {
                tracing::info!(local_port, "tunnel stopped by request");
                break;
            }
            _ = ping.tick() => {
                let _ = control_send.write_all(&RelayCtrl::Ping.to_line()?).await;
            }
            ctrl = read_ctrl(&mut control_recv) => {
                match ctrl? {
                    Some(RelayCtrl::Ping) => {
                        let _ = control_send.write_all(&RelayCtrl::Pong.to_line()?).await;
                    }
                    Some(RelayCtrl::Pong) | Some(RelayCtrl::Ok) => {}
                    Some(RelayCtrl::Error { message }) => {
                        bail!("relay error on control: {message}");
                    }
                    Some(RelayCtrl::Register { .. }) | Some(RelayCtrl::Forward { .. }) => {}
                    None => {
                        tracing::info!(local_port, "relay control stream closed");
                        break;
                    }
                }
            }
            bi = conn.accept_bi() => {
                let (send, recv) = match bi {
                    Ok(pair) => pair,
                    Err(e) => {
                        tracing::debug!(?e, "relay accept_bi closed");
                        break;
                    }
                };
                let rules = redirect_rules.clone();
                let proto = protocol.clone();
                tokio::spawn(async move {
                    if let Err(e) =
                        handle_relay_stream(send, recv, local_port, &proto, &rules).await
                    {
                        tracing::debug!(?e, "relay stream proxy ended");
                    }
                });
            }
        }
    }
    Ok(())
}

async fn read_ctrl(reader: &mut BufReader<RecvStream>) -> anyhow::Result<Option<RelayCtrl>> {
    let mut line = String::new();
    let n = reader.read_line(&mut line).await?;
    if n == 0 {
        return Ok(None);
    }
    Ok(Some(RelayCtrl::from_line(&line)?))
}

async fn handle_relay_stream(
    send: SendStream,
    mut recv: RecvStream,
    default_port: u16,
    protocol: &str,
    redirect_rules: &[RedirectRule],
) -> anyhow::Result<()> {
    if protocol == "tcp" {
        let (target_port, target_ip) = read_forward_target(&mut recv).await?;
        return splice_to_target(send, recv, target_port, target_ip, None).await;
    }

    if !redirect_rules.is_empty() {
        let mut peek = vec![0u8; 8 * 1024];
        let n = match tokio::time::timeout(Duration::from_secs(10), recv.read(&mut peek)).await {
            Ok(Ok(Some(n))) => n,
            Ok(Ok(None)) => 0,
            Ok(Err(e)) => return Err(e.into()),
            Err(_) => bail!("HTTPS peek timeout"),
        };
        peek.truncate(n);
        let path = parse_http_path(&peek);
        let matched = path
            .as_deref()
            .and_then(|p| match_redirect(redirect_rules, p));
        let target_port = matched.map(|r| r.target_port).unwrap_or(default_port);
        let target_ip = matched.and_then(|r| r.target_ipv4);
        let prefix = if n > 0 { Some(peek) } else { None };
        return splice_to_target(send, recv, target_port, target_ip, prefix).await;
    }

    splice_to_target(send, recv, default_port, None, None).await
}

async fn read_forward_target(recv: &mut RecvStream) -> anyhow::Result<(u16, Option<Ipv4Addr>)> {
    let mut line = Vec::with_capacity(64);
    let mut byte = [0u8; 1];
    loop {
        recv.read_exact(&mut byte)
            .await
            .context("read Forward header")?;
        if byte[0] == b'\n' {
            break;
        }
        if line.len() > 512 {
            bail!("Forward header too long");
        }
        line.push(byte[0]);
    }
    let text = std::str::from_utf8(&line).context("Forward header utf8")?;
    match RelayCtrl::from_line(text)? {
        RelayCtrl::Forward {
            target_port,
            target_ip,
        } => {
            let ip = target_ip
                .as_deref()
                .map(|s| s.parse::<Ipv4Addr>())
                .transpose()
                .context("parse Forward target_ip")?;
            Ok((target_port, ip))
        }
        other => bail!("expected Forward on TCP stream, got {other:?}"),
    }
}

async fn splice_to_target(
    send: SendStream,
    recv: RecvStream,
    port: u16,
    target_ip: Option<Ipv4Addr>,
    prefix: Option<Vec<u8>>,
) -> anyhow::Result<()> {
    let host = target_ip.unwrap_or(Ipv4Addr::LOCALHOST);
    let addr = SocketAddr::from((host, port));
    let tcp = TcpStream::connect(addr)
        .await
        .with_context(|| format!("connect {addr}"))?;
    let _ = tcp.set_nodelay(true);
    let (tcp_read, mut tcp_write) = tcp.into_split();
    if let Some(bytes) = prefix {
        tcp_write.write_all(&bytes).await?;
    }
    splice_bidirectional(recv, send, tcp_read, tcp_write).await
}

fn parse_http_path(buf: &[u8]) -> Option<String> {
    let text = std::str::from_utf8(buf).ok()?;
    let line = text.lines().next()?.trim();
    let mut parts = line.split_whitespace();
    let _method = parts.next()?;
    let target = parts.next()?;
    Some(target.split('?').next().unwrap_or(target).to_string())
}
