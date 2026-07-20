//! Mesh-IP HTTP reverse-proxy with inspection (Direct mode).
//!
//! Binds `{mesh_ip}:{port}` (same pattern as `tunnet serve`) and forwards to
//! `127.0.0.1:{port}`, teeing HTTP for the local inspector. Peers keep dialing
//! the real mesh port; the app should listen on localhost only.

use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;

use anyhow::{Context, bail};
use tokio::net::TcpListener;
use tokio::sync::oneshot;

use super::InspectorHub;
use super::http_tee::inspect_bidirectional;
use super::store::ExchangeStore;

/// Accept connections on `listener`, tee HTTP through the inspector, forward to `upstream`.
pub async fn run_local_proxy(
    listener: TcpListener,
    upstream: SocketAddr,
    store: ExchangeStore,
    tunnel_id: String,
    mut stop: oneshot::Receiver<()>,
) -> anyhow::Result<()> {
    loop {
        tokio::select! {
            _ = &mut stop => {
                tracing::info!(%upstream, "inspect proxy stopped");
                break;
            }
            accepted = listener.accept() => {
                let (client, peer) = accepted.context("accept")?;
                let _ = client.set_nodelay(true);
                let store = store.clone();
                let tid = tunnel_id.clone();
                tokio::spawn(async move {
                    if let Err(e) = proxy_one(client, upstream, store, tid).await {
                        tracing::debug!(?e, %peer, "inspect connection ended");
                    }
                });
            }
        }
    }
    Ok(())
}

async fn proxy_one(
    client: tokio::net::TcpStream,
    upstream: SocketAddr,
    store: ExchangeStore,
    tunnel_id: String,
) -> anyhow::Result<()> {
    let upstream_tcp = tokio::net::TcpStream::connect(upstream)
        .await
        .with_context(|| format!("connect upstream {upstream}"))?;
    let _ = upstream_tcp.set_nodelay(true);

    let (client_read, client_write) = client.into_split();
    let (up_read, up_write) = upstream_tcp.into_split();

    inspect_bidirectional(
        client_read,
        client_write,
        up_read,
        up_write,
        None,
        store,
        tunnel_id,
    )
    .await
}

/// Bind `{mesh_ip}:{port}` and start inspector + proxy.
///
/// Returns `(forward_url, inspector_url, stop_tx)`.
pub async fn start_local_inspect_session(
    hub: &InspectorHub,
    tunnel_id: &str,
    mesh_ip: Ipv4Addr,
    port: u16,
    inspect_addr: Option<&str>,
) -> anyhow::Result<(String, String, oneshot::Sender<()>)> {
    if mesh_ip.is_unspecified() {
        bail!("mesh IP not assigned; bring the data plane up (`tunnet up`) and retry");
    }

    let bind = SocketAddr::from((mesh_ip, port));
    let upstream = SocketAddr::from((Ipv4Addr::LOCALHOST, port));

    let inspector_url = hub
        .register_tunnel(tunnel_id, upstream, inspect_addr)
        .await?;

    let listener = TcpListener::bind(bind).await.with_context(|| {
        format!(
            "bind inspect proxy on {bind}. \
             Bind your app to 127.0.0.1:{port} only (not 0.0.0.0) so Tunnet can own the mesh port"
        )
    })?;

    let forward_url = format!("http://{mesh_ip}:{port}");
    let (stop_tx, stop_rx) = oneshot::channel();
    let store = hub.store();
    let tid = tunnel_id.to_string();
    let hub = Arc::new(hub.clone());
    let tid_cleanup = tid.clone();

    tokio::spawn(async move {
        let _ = run_local_proxy(listener, upstream, store, tid, stop_rx).await;
        hub.unregister_tunnel(&tid_cleanup);
    });

    Ok((forward_url, inspector_url, stop_tx))
}
