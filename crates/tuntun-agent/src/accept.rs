//! Single inbound accept loop that demuxes connections by ALPN.
//!
//! Multiple concurrent `endpoint.accept()` loops race and drop wrong-ALPN
//! connections. The agent must use exactly one acceptor.

use std::sync::Arc;

use iroh::Endpoint;
use tun_rs::AsyncDevice;
use tuntun_common::ws::ClientMsg;
use tuntun_common::{RECORDING_ALPN, SSH_ALPN, TUNNEL_ALPN};
use tuntun_core::stream::{StreamHandler, TUNNEL_STREAM_ALPN, serve_stream_connection};
use tuntun_core::{AclEngine, ConnPool, RoutingTable, SignedClient};

use crate::metrics::AgentMetrics;
use crate::recorder::{RecordingStore, serve_recording_connection};
use crate::ssh::{SshServeDeps, SshSessionRegistry, serve_ssh_connection};
use crate::tun_io::serve_tunnel_connection;

pub struct AcceptDeps {
    pub endpoint: Endpoint,
    pub routes: RoutingTable,
    pub acl: AclEngine,
    pub metrics: AgentMetrics,
    pub tun: Arc<AsyncDevice>,
    pub stream_handler: StreamHandler,
    pub ssh_sessions: SshSessionRegistry,
    pub cp_tx: Option<tokio::sync::mpsc::Sender<ClientMsg>>,
    pub pool: ConnPool,
    pub recording_store: Option<Arc<RecordingStore>>,
    pub signed: Option<SignedClient>,
    pub hostname: String,
    pub network_name: String,
    pub self_endpoint_id: String,
    pub recorder_enabled: bool,
}

pub fn spawn(deps: AcceptDeps) {
    tokio::spawn(async move {
        tracing::info!("unified ALPN accept router started");
        while let Some(incoming) = deps.endpoint.accept().await {
            let routes = deps.routes.clone();
            let acl = deps.acl.clone();
            let metrics = deps.metrics.clone();
            let tun = deps.tun.clone();
            let stream_handler = deps.stream_handler.clone();
            let ssh_sessions = deps.ssh_sessions.clone();
            let cp_tx = deps.cp_tx.clone();
            let pool = deps.pool.clone();
            let recording_store = deps.recording_store.clone();
            let signed = deps.signed.clone();
            let hostname = deps.hostname.clone();
            let network_name = deps.network_name.clone();
            let self_endpoint_id = deps.self_endpoint_id.clone();
            let recorder_enabled = deps.recorder_enabled;
            tokio::spawn(async move {
                let conn = match incoming.await {
                    Ok(c) => c,
                    Err(e) => {
                        tracing::warn!(?e, "incoming handshake failed");
                        return;
                    }
                };
                let alpn = conn.alpn();
                if alpn == TUNNEL_STREAM_ALPN {
                    serve_stream_connection(conn, stream_handler).await;
                } else if alpn == TUNNEL_ALPN {
                    serve_tunnel_connection(conn, tun, routes, acl, metrics).await;
                } else if alpn == SSH_ALPN {
                    serve_ssh_connection(
                        conn,
                        SshServeDeps {
                            routes,
                            acl,
                            sessions: ssh_sessions,
                            cp_tx,
                            pool,
                            store: recording_store,
                            signed,
                            hostname,
                            network_name,
                            self_endpoint_id,
                        },
                    )
                    .await;
                } else if alpn == RECORDING_ALPN {
                    if recorder_enabled {
                        if let Some(store) = recording_store {
                            serve_recording_connection(
                                conn,
                                store,
                                cp_tx,
                                signed,
                                self_endpoint_id,
                            )
                            .await;
                        } else {
                            tracing::warn!("recording ALPN accepted but store is missing");
                        }
                    } else {
                        tracing::debug!("ignoring recording ALPN (recorder not enabled)");
                    }
                } else {
                    tracing::debug!(
                        alpn = %String::from_utf8_lossy(alpn),
                        "ignoring unknown ALPN"
                    );
                }
            });
        }
        tracing::error!("unified ALPN accept router exited");
    });
}
