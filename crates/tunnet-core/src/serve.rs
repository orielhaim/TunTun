//! Tunnet Serve - TLS (or TCP) reverse proxy on the mesh interface → upstream.
//!
//! `tunnet serve 3000` listens on the agent's mesh IP with an internal-CA cert
//! and forwards decrypted traffic to a configurable upstream (default `127.0.0.1:port`).

use std::collections::HashMap;
use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;

use anyhow::{Context, bail};
use parking_lot::Mutex;
use rustls::ServerConfig;
use rustls::pki_types::CertificateDer;
use tokio::io::AsyncWriteExt;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, oneshot};
use tokio_rustls::TlsAcceptor;
use tunnet_common::ws::ClientMsg;

use crate::ipc::protocol::ServeInfo;
use crate::routing::RoutingTable;

#[derive(Debug, Clone)]
pub struct ServeAcl {
    pub access_mode: String,
    pub allowed_tags: Vec<String>,
    pub allowed_endpoint_ids: Vec<String>,
}

impl Default for ServeAcl {
    fn default() -> Self {
        Self {
            access_mode: "all_peers".into(),
            allowed_tags: Vec::new(),
            allowed_endpoint_ids: Vec::new(),
        }
    }
}

#[derive(Clone)]
pub struct ServeManager {
    inner: Arc<Mutex<Inner>>,
    mesh_ip: Ipv4Addr,
    routes: RoutingTable,
    /// Optional WS client channel for ServePeerJoined / ServePeerLeft.
    client_tx: Arc<Mutex<Option<mpsc::Sender<ClientMsg>>>>,
}

struct Inner {
    serves: HashMap<u16, ActiveServe>,
}

struct ActiveServe {
    info: ServeInfo,
    stop: Option<oneshot::Sender<()>>,
}

impl ServeManager {
    pub fn new(mesh_ip: Ipv4Addr, routes: RoutingTable) -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner {
                serves: HashMap::new(),
            })),
            mesh_ip,
            routes,
            client_tx: Arc::new(Mutex::new(None)),
        }
    }

    /// Wire control-plane reporting (call once after WS channel is created).
    pub fn set_client_tx(&self, tx: mpsc::Sender<ClientMsg>) {
        *self.client_tx.lock() = Some(tx);
    }

    pub fn client_tx(&self) -> Option<mpsc::Sender<ClientMsg>> {
        self.client_tx.lock().clone()
    }

    pub fn list(&self) -> Vec<ServeInfo> {
        self.inner
            .lock()
            .serves
            .values()
            .map(|s| s.info.clone())
            .collect()
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn start(
        &self,
        id: String,
        port: u16,
        protocol: &str,
        internal_hostname: &str,
        certificate_pem: Option<&str>,
        private_key_pem: Option<&str>,
        acl: ServeAcl,
        // Upstream to proxy to (defaults to `127.0.0.1:port` when `None`).
        target_addr: Option<SocketAddr>,
    ) -> anyhow::Result<ServeInfo> {
        {
            let guard = self.inner.lock();
            if let Some(existing) = guard.serves.values().find(|s| s.info.id == id) {
                tracing::debug!(%id, port, "serve already active - skipping start");
                return Ok(existing.info.clone());
            }
            if guard.serves.contains_key(&port) {
                // Port held by a different serve id - replace it.
                drop(guard);
                let _ = self.stop(port);
            }
        }

        let url = match protocol {
            "tcp" => format!("{}:{}", internal_hostname, port),
            _ => format!("https://{}:{}", internal_hostname, port),
        };

        let info = ServeInfo {
            id: id.clone(),
            port,
            protocol: protocol.to_string(),
            url: url.clone(),
            status: "active".into(),
        };

        let (stop_tx, stop_rx) = oneshot::channel();
        let bind = SocketAddr::from((self.mesh_ip, port));
        let local = target_addr.unwrap_or_else(|| SocketAddr::from((Ipv4Addr::LOCALHOST, port)));
        let routes = self.routes.clone();
        let acl_c = acl.clone();
        let client_tx = self.client_tx.clone();
        let serve_id = id.clone();

        if protocol == "tcp" {
            let mgr = self.clone();
            let port_c = port;
            tokio::spawn(async move {
                if let Err(e) =
                    run_tcp_proxy(bind, local, routes, acl_c, serve_id, client_tx, stop_rx).await
                {
                    tracing::error!(?e, port = port_c, "serve tcp proxy exited");
                }
                mgr.inner.lock().serves.remove(&port_c);
            });
        } else {
            let cert_pem = certificate_pem.context("HTTPS serve requires certificate_pem")?;
            let key_pem = private_key_pem.context("HTTPS serve requires private_key_pem")?;
            let acceptor = build_tls_acceptor(cert_pem, key_pem)?;
            let mgr = self.clone();
            let port_c = port;
            tokio::spawn(async move {
                if let Err(e) = run_tls_proxy(
                    bind, local, acceptor, routes, acl_c, serve_id, client_tx, stop_rx,
                )
                .await
                {
                    tracing::error!(?e, port = port_c, "serve tls proxy exited");
                }
                mgr.inner.lock().serves.remove(&port_c);
            });
        }

        self.inner.lock().serves.insert(
            port,
            ActiveServe {
                info: info.clone(),
                stop: Some(stop_tx),
            },
        );

        tracing::info!(%url, port, protocol, "serve active");
        Ok(info)
    }

    pub fn stop(&self, port: u16) -> anyhow::Result<ServeInfo> {
        let mut guard = self.inner.lock();
        let Some(mut active) = guard.serves.remove(&port) else {
            bail!("no active serve on port {port}");
        };
        if let Some(tx) = active.stop.take() {
            let _ = tx.send(());
        }
        active.info.status = "stopped".into();
        Ok(active.info)
    }
}

fn allow_peer(routes: &RoutingTable, acl: &ServeAcl, peer_addr: SocketAddr) -> bool {
    match acl.access_mode.as_str() {
        "all_peers" => true,
        "machines" => {
            let Some(peer) = routes.lookup_ip(&match peer_addr.ip() {
                std::net::IpAddr::V4(ip) => ip,
                std::net::IpAddr::V6(_) => return false,
            }) else {
                return false;
            };
            acl.allowed_endpoint_ids
                .iter()
                .any(|id| id.eq_ignore_ascii_case(&peer.endpoint_hex))
        }
        "tags" => {
            let Some(peer) = routes.lookup_ip(&match peer_addr.ip() {
                std::net::IpAddr::V4(ip) => ip,
                std::net::IpAddr::V6(_) => return false,
            }) else {
                // Unknown peer - deny in tags mode.
                return false;
            };
            peer.tags
                .iter()
                .any(|t| acl.allowed_tags.iter().any(|a| a == t))
        }
        _ => true,
    }
}

fn peer_identity(routes: &RoutingTable, peer_addr: SocketAddr) -> (String, Option<String>) {
    let ip = match peer_addr.ip() {
        std::net::IpAddr::V4(ip) => ip,
        std::net::IpAddr::V6(_) => return (peer_addr.ip().to_string(), None),
    };
    match routes.lookup_ip(&ip) {
        Some(peer) => {
            let hostname = if peer.hostname.is_empty() {
                None
            } else {
                Some(peer.hostname.clone())
            };
            (peer.endpoint_hex.clone(), hostname)
        }
        None => (peer_addr.ip().to_string(), None),
    }
}

fn report(tx: &Arc<Mutex<Option<mpsc::Sender<ClientMsg>>>>, msg: ClientMsg) {
    if let Some(sender) = tx.lock().as_ref() {
        let _ = sender.try_send(msg);
    }
}

fn build_tls_acceptor(cert_pem: &str, key_pem: &str) -> anyhow::Result<TlsAcceptor> {
    let mut cert_reader = std::io::Cursor::new(cert_pem.as_bytes());
    let certs: Vec<CertificateDer<'static>> = rustls_pemfile::certs(&mut cert_reader)
        .collect::<Result<Vec<_>, _>>()
        .context("parse certificate PEM")?;
    if certs.is_empty() {
        bail!("no certificates in PEM");
    }

    let mut key_reader = std::io::Cursor::new(key_pem.as_bytes());
    let key = rustls_pemfile::private_key(&mut key_reader)
        .context("parse private key PEM")?
        .context("no private key in PEM")?;

    let mut cfg = ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(certs, key)
        .context("build rustls ServerConfig")?;
    cfg.alpn_protocols = vec![b"http/1.1".to_vec(), b"h2".to_vec()];

    Ok(TlsAcceptor::from(Arc::new(cfg)))
}

async fn run_tcp_proxy(
    bind: SocketAddr,
    local: SocketAddr,
    routes: RoutingTable,
    acl: ServeAcl,
    serve_id: String,
    client_tx: Arc<Mutex<Option<mpsc::Sender<ClientMsg>>>>,
    mut stop: oneshot::Receiver<()>,
) -> anyhow::Result<()> {
    let listener = TcpListener::bind(bind)
        .await
        .with_context(|| format!("bind serve TCP {bind}"))?;
    tracing::info!(%bind, %local, "serve TCP listening");
    loop {
        tokio::select! {
            _ = &mut stop => {
                tracing::info!(%bind, "serve TCP stopped");
                break;
            }
            accepted = listener.accept() => {
                let (inbound, peer) = accepted?;
                if !allow_peer(&routes, &acl, peer) {
                    tracing::debug!(%peer, "serve ACL denied");
                    continue;
                }
                let (peer_endpoint_id, peer_hostname) = peer_identity(&routes, peer);
                let serve_id = serve_id.clone();
                let client_tx = client_tx.clone();
                report(
                    &client_tx,
                    ClientMsg::ServePeerJoined {
                        serve_id: serve_id.clone(),
                        peer_endpoint_id: peer_endpoint_id.clone(),
                        peer_hostname,
                    },
                );
                tokio::spawn(async move {
                    let result = proxy_tcp(inbound, local).await;
                    let (bytes_in, bytes_out) = result.unwrap_or((0, 0));
                    report(
                        &client_tx,
                        ClientMsg::ServePeerLeft {
                            serve_id,
                            peer_endpoint_id,
                            bytes_in,
                            bytes_out,
                        },
                    );
                });
            }
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn run_tls_proxy(
    bind: SocketAddr,
    local: SocketAddr,
    acceptor: TlsAcceptor,
    routes: RoutingTable,
    acl: ServeAcl,
    serve_id: String,
    client_tx: Arc<Mutex<Option<mpsc::Sender<ClientMsg>>>>,
    mut stop: oneshot::Receiver<()>,
) -> anyhow::Result<()> {
    let listener = TcpListener::bind(bind)
        .await
        .with_context(|| format!("bind serve TLS {bind}"))?;
    tracing::info!(%bind, %local, "serve HTTPS listening");
    loop {
        tokio::select! {
            _ = &mut stop => {
                tracing::info!(%bind, "serve HTTPS stopped");
                break;
            }
            accepted = listener.accept() => {
                let (inbound, peer) = accepted?;
                if !allow_peer(&routes, &acl, peer) {
                    tracing::debug!(%peer, "serve ACL denied");
                    continue;
                }
                let (peer_endpoint_id, peer_hostname) = peer_identity(&routes, peer);
                let serve_id = serve_id.clone();
                let client_tx = client_tx.clone();
                let acceptor = acceptor.clone();
                report(
                    &client_tx,
                    ClientMsg::ServePeerJoined {
                        serve_id: serve_id.clone(),
                        peer_endpoint_id: peer_endpoint_id.clone(),
                        peer_hostname,
                    },
                );
                tokio::spawn(async move {
                    let tls = match acceptor.accept(inbound).await {
                        Ok(s) => s,
                        Err(e) => {
                            tracing::debug!(?e, %peer, "TLS handshake failed");
                            report(
                                &client_tx,
                                ClientMsg::ServePeerLeft {
                                    serve_id,
                                    peer_endpoint_id,
                                    bytes_in: 0,
                                    bytes_out: 0,
                                },
                            );
                            return;
                        }
                    };
                    let result = proxy_tls(tls, local).await;
                    let (bytes_in, bytes_out) = result.unwrap_or((0, 0));
                    report(
                        &client_tx,
                        ClientMsg::ServePeerLeft {
                            serve_id,
                            peer_endpoint_id,
                            bytes_in,
                            bytes_out,
                        },
                    );
                });
            }
        }
    }
    Ok(())
}

async fn proxy_tcp(mut inbound: TcpStream, local: SocketAddr) -> anyhow::Result<(u64, u64)> {
    let mut outbound = TcpStream::connect(local).await?;
    let _ = inbound.set_nodelay(true);
    let _ = outbound.set_nodelay(true);
    let (bytes_in, bytes_out) = tokio::io::copy_bidirectional(&mut inbound, &mut outbound).await?;
    Ok((bytes_in, bytes_out))
}

async fn proxy_tls(
    mut inbound: tokio_rustls::server::TlsStream<TcpStream>,
    local: SocketAddr,
) -> anyhow::Result<(u64, u64)> {
    let mut outbound = TcpStream::connect(local).await?;
    let _ = outbound.set_nodelay(true);
    let (bytes_in, bytes_out) = tokio::io::copy_bidirectional(&mut inbound, &mut outbound).await?;
    let _ = outbound.shutdown().await;
    Ok((bytes_in, bytes_out))
}
