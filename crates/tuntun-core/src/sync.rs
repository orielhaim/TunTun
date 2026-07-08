use std::sync::Arc;
use std::time::Duration;

use anyhow::Context;
use arc_swap::ArcSwap;
use tuntun_common::ws::{ClientMsg, ServerMsg};
use tuntun_common::{EndpointSnapshot, NetworkMembershipSnapshot};
use uuid::Uuid;

use crate::acl::AclEngine;
use crate::control::SignedClient;
use crate::routing::RoutingTable;
use crate::state::{StatePaths, save_snapshot_cache};
use crate::ws_client::WsChannel;

pub fn membership_for_network<'a>(
    snap: &'a EndpointSnapshot,
    network_id: Uuid,
) -> anyhow::Result<&'a NetworkMembershipSnapshot> {
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
) {
    routes.replace(&membership.ipv4_peers, membership.version);
    acl.replace_bundle(membership.policy.clone());
    version.store(Arc::new(org_version));
}

pub struct SyncHandles {
    pub version: Arc<ArcSwap<u64>>,
}

pub fn spawn_ws_processor(
    mut ws: WsChannel,
    routes: RoutingTable,
    acl: AclEngine,
    version: Arc<ArcSwap<u64>>,
    paths: StatePaths,
    network_id: Uuid,
    agent_version: &'static str,
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
                                apply_membership(m, &routes, &acl, &version, snap.version);
                                save_snapshot_cache(&paths, &snap).ok();
                                tracing::info!(v = m.version, peers = m.ipv4_peers.len(),
                                    "snapshot from ws");
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

pub fn spawn_poll_fallback(
    client: SignedClient,
    version: Arc<ArcSwap<u64>>,
    poll_secs: u64,
    routes: RoutingTable,
    acl: AclEngine,
    network_id: Uuid,
) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(poll_secs));
        ticker.tick().await;
        loop {
            ticker.tick().await;
            match client.poll(**version.load()).await {
                Ok(snap) => {
                    if snap.version != **version.load() {
                        if let Ok(m) = membership_for_network(&snap, network_id) {
                            apply_membership(m, &routes, &acl, &version, snap.version);
                            tracing::info!(
                                v = m.version,
                                peers = m.ipv4_peers.len(),
                                "snapshot via poll"
                            );
                        }
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
