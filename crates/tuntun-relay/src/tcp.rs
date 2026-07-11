//! Dynamic TCP listeners for tunnel port mappings.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::Context;
use parking_lot::Mutex;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;
use tuntun_common::PortMapping;
use tuntun_common::relay::RelayCtrl;

use crate::registry::TunnelRegistry;

type MappingKey = (String, u16); // (subdomain, external_port)

struct ActiveListener {
    stop: oneshot::Sender<()>,
}

#[derive(Clone, Default)]
pub struct TcpMappingManager {
    inner: Arc<Mutex<HashMap<MappingKey, ActiveListener>>>,
}

impl TcpMappingManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Reconcile desired mappings from heartbeat against live listeners.
    pub fn reconcile(&self, desired: Vec<(String, String, PortMapping)>, registry: TunnelRegistry) {
        let desired_keys: Vec<MappingKey> = desired
            .iter()
            .map(|(sub, _, m)| (sub.to_ascii_lowercase(), m.external_port))
            .collect();

        {
            let mut guard = self.inner.lock();
            let stale: Vec<MappingKey> = guard
                .keys()
                .filter(|k| !desired_keys.contains(k))
                .cloned()
                .collect();
            for key in stale {
                if let Some(listener) = guard.remove(&key) {
                    let _ = listener.stop.send(());
                }
            }
        }

        for (subdomain, tunnel_id, mapping) in desired {
            let key = (subdomain.to_ascii_lowercase(), mapping.external_port);
            {
                let guard = self.inner.lock();
                if guard.contains_key(&key) {
                    continue;
                }
            }

            let (stop_tx, stop_rx) = oneshot::channel();
            {
                let mut guard = self.inner.lock();
                if guard.contains_key(&key) {
                    continue;
                }
                guard.insert(key.clone(), ActiveListener { stop: stop_tx });
            }

            let registry = registry.clone();
            let mgr = self.clone();
            let subdomain = key.0.clone();
            let external_port = mapping.external_port;
            let target_port = mapping.target_port;
            let target_ip = mapping.target_ipv4.map(|ip| ip.to_string());
            tokio::spawn(async move {
                if let Err(e) = run_tcp_listener(
                    subdomain.clone(),
                    tunnel_id,
                    external_port,
                    target_port,
                    target_ip,
                    registry,
                    stop_rx,
                )
                .await
                {
                    tracing::warn!(
                        ?e,
                        %subdomain,
                        external_port,
                        "TCP mapping listener exited"
                    );
                }
                mgr.inner.lock().remove(&(subdomain, external_port));
            });
        }
    }
}

async fn run_tcp_listener(
    subdomain: String,
    _tunnel_id: String,
    external_port: u16,
    target_port: u16,
    target_ip: Option<String>,
    registry: TunnelRegistry,
    mut stop: oneshot::Receiver<()>,
) -> anyhow::Result<()> {
    let bind = SocketAddr::from(([0, 0, 0, 0], external_port));
    let listener = TcpListener::bind(bind)
        .await
        .with_context(|| format!("bind TCP mapping {bind}"))?;
    tracing::info!(%subdomain, external_port, target_port, "TCP mapping listening");

    loop {
        tokio::select! {
            _ = &mut stop => {
                tracing::info!(%subdomain, external_port, "TCP mapping stopped");
                break;
            }
            accepted = listener.accept() => {
                let (tcp, peer) = accepted?;
                let registry = registry.clone();
                let subdomain = subdomain.clone();
                let target_ip = target_ip.clone();
                tokio::spawn(async move {
                    if let Err(e) =
                        handle_tcp_client(tcp, peer, &subdomain, target_port, target_ip, registry).await
                    {
                        tracing::debug!(?e, %peer, %subdomain, "TCP mapping session ended");
                    }
                });
            }
        }
    }
    Ok(())
}

async fn handle_tcp_client(
    tcp: TcpStream,
    peer: SocketAddr,
    subdomain: &str,
    target_port: u16,
    target_ip: Option<String>,
    registry: TunnelRegistry,
) -> anyhow::Result<()> {
    let slot = registry
        .get(subdomain)
        .with_context(|| format!("no tunnel for subdomain {subdomain}"))?;
    let conn = {
        let guard = slot.conn.lock();
        guard
            .clone()
            .with_context(|| format!("tunnel for {subdomain} not connected"))?
    };

    let (mut send, mut recv) = conn.open_bi().await.context("open bi to agent")?;
    // Tell agent which host:port to dial.
    send.write_all(
        &RelayCtrl::Forward {
            target_port,
            target_ip,
        }
        .to_line()
        .context("encode forward")?,
    )
    .await?;

    tracing::debug!(%subdomain, %peer, target_port, "TCP mapping proxying to agent");

    let (mut tcp_read, mut tcp_write) = tcp.into_split();
    let up = async {
        let mut buf = vec![0u8; 32 * 1024];
        loop {
            let n = tcp_read.read(&mut buf).await?;
            if n == 0 {
                break;
            }
            send.write_all(&buf[..n]).await?;
        }
        send.finish().ok();
        Ok::<_, anyhow::Error>(())
    };
    let down = async {
        let mut buf = vec![0u8; 32 * 1024];
        loop {
            match recv.read(&mut buf).await? {
                Some(n) => tcp_write.write_all(&buf[..n]).await?,
                None => break,
            }
        }
        Ok::<_, anyhow::Error>(())
    };
    let (a, b) = tokio::join!(up, down);
    a?;
    b?;
    Ok(())
}
