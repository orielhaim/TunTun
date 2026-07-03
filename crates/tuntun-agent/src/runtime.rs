//! Top-level agent runtime: builds the iroh endpoint from the persisted
//! secret key, brings up the TUN, starts the WS + fallback polling loop,
//! spawns gossip presence, and wires ACL enforcement into the hot paths.

use std::sync::Arc;
use std::time::Duration;

use anyhow::Context;
use arc_swap::ArcSwap;
use iroh::endpoint::presets;
use iroh::{Endpoint, SecretKey};
use tuntun_common::{EndpointSnapshot, NetworkMembershipSnapshot, TUNNEL_ALPN};
use uuid::Uuid;

use crate::cli::RunArgs;
use crate::control_client::SignedClient;
use crate::enforcement::{AclEngine, SelfIdentity};
use crate::iroh_io::ConnPool;
use crate::metrics::AgentMetrics;
use crate::persistent::{
    AgentIdentity, PersistedState, StatePaths, load_snapshot_cache, save_snapshot_cache,
};
use crate::routing::RoutingTable;
use crate::tun_io::{build_tun, run_inbound, run_outbound};
use tuntun_common::ws::{ClientMsg, ServerMsg};

fn membership_for_network<'a>(
    snap: &'a EndpointSnapshot,
    network_id: Uuid,
) -> anyhow::Result<&'a NetworkMembershipSnapshot> {
    snap.memberships
        .iter()
        .find(|m| m.network_id == network_id)
        .with_context(|| format!("network {network_id} not in snapshot"))
}

fn apply_membership(
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

pub async fn run(
    identity: AgentIdentity,
    persisted: PersistedState,
    paths: StatePaths,
    args: RunArgs,
) -> anyhow::Result<()> {
    let metrics = AgentMetrics::new().context("metrics")?;

    let secret = SecretKey::from_bytes(&identity.secret_bytes);
    let endpoint = Endpoint::builder(presets::N0)
        .secret_key(secret)
        .alpns(vec![TUNNEL_ALPN.to_vec()])
        .bind()
        .await
        .context("bind iroh endpoint")?;
    let my_id_hex = format!("{}", endpoint.id());
    debug_assert_eq!(my_id_hex, identity.endpoint_id_hex());

    match tokio::time::timeout(Duration::from_secs(10), endpoint.online()).await {
        Ok(()) => tracing::info!("endpoint online"),
        Err(_) => tracing::warn!("timed out waiting for relay; continuing"),
    }

    let signed = SignedClient::new(
        persisted.control_url.clone(),
        my_id_hex.clone(),
        identity.signing_key.clone(),
    )?;

    let hostname = std::env::var("HOSTNAME").unwrap_or_else(|_| "tuntun-node".into());
    let endpoint_snap: EndpointSnapshot = match signed.register(&hostname).await {
        Ok(s) => {
            save_snapshot_cache(&paths, &s).ok();
            s
        }
        Err(e) => {
            tracing::warn!(?e, "register failed; falling back to cached snapshot");
            match load_snapshot_cache(&paths) {
                Some(s) => s,
                None => return Err(e.context("register and no cache available")),
            }
        }
    };

    let snapshot = membership_for_network(&endpoint_snap, persisted.network_id)?;
    let routes = RoutingTable::new();
    let version = Arc::new(ArcSwap::from_pointee(endpoint_snap.version));
    let acl = AclEngine::new(
        SelfIdentity {
            endpoint_hex: my_id_hex.clone(),
            ip: snapshot.assigned_ipv4,
            tags: vec![],
            network: persisted.network_name.clone(),
        },
        routes.clone(),
        snapshot.policy.clone(),
    );
    apply_membership(snapshot, &routes, &acl, &version, endpoint_snap.version);

    #[cfg(windows)]
    let wintun_file = args.wintun_file.as_deref();
    let tun = Arc::new(build_tun(
        &args.ifname,
        snapshot.assigned_ipv4,
        snapshot.prefix,
        snapshot.mtu,
        #[cfg(windows)]
        wintun_file,
    )?);

    crate::metrics::spawn_listeners(metrics.clone(), &args.metrics_bind, snapshot.assigned_ipv4);

    let pool = ConnPool::new(endpoint.clone());

    let outbound = {
        let tun = tun.clone();
        let routes = routes.clone();
        let pool = pool.clone();
        let acl = acl.clone();
        let metrics = metrics.clone();
        tokio::spawn(async move {
            if let Err(e) = run_outbound(tun, routes, pool, acl, metrics).await {
                tracing::error!(?e, "outbound crashed");
            }
        })
    };
    let inbound = {
        let ep = endpoint.clone();
        let tun = tun.clone();
        let acl = acl.clone();
        let metrics = metrics.clone();
        tokio::spawn(async move {
            if let Err(e) = run_inbound(ep, tun, acl, metrics).await {
                tracing::error!(?e, "inbound crashed");
            }
        })
    };

    if !args.disable_gossip {
        match iroh_gossip::Gossip::builder().spawn(endpoint.clone()) {
            gossip => {
                let bootstrap = snapshot
                    .gossip_bootstrap
                    .iter()
                    .filter_map(|h| h.parse().ok())
                    .collect::<Vec<_>>();
                let ep = endpoint.clone();
                let topic_hex = snapshot.gossip_topic_hex.clone();
                let hostname = hostname.clone();
                tokio::spawn(async move {
                    if let Err(e) =
                        crate::gossip_presence::spawn(ep, gossip, topic_hex, bootstrap, hostname)
                            .await
                    {
                        tracing::warn!(?e, "gossip presence disabled");
                    }
                });
            }
        }
    }

    let ws = crate::ws_client::spawn(
        persisted.control_url.clone(),
        my_id_hex.clone(),
        identity.signing_key.clone(),
    );
    spawn_ws_processor(
        ws,
        routes.clone(),
        acl.clone(),
        version.clone(),
        paths,
        persisted.network_id,
    );
    spawn_poll_fallback(
        signed,
        version.clone(),
        args.poll_secs,
        routes.clone(),
        acl.clone(),
        persisted.network_id,
    );

    tokio::select! {
        _ = outbound => tracing::error!("outbound task exited"),
        _ = inbound => tracing::error!("inbound task exited"),
        _ = tokio::signal::ctrl_c() => tracing::info!("ctrl-c, shutting down"),
    }

    endpoint.close().await;
    Ok(())
}

fn spawn_ws_processor(
    mut ws: crate::ws_client::WsChannel,
    routes: RoutingTable,
    acl: AclEngine,
    version: Arc<ArcSwap<u64>>,
    paths: StatePaths,
    network_id: Uuid,
) {
    tokio::spawn(async move {
        let _ = ws
            .tx
            .send(ClientMsg::Hello {
                endpoint_id: "self".into(),
                agent_version: env!("CARGO_PKG_VERSION").into(),
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
                                tracing::info!(
                                    v = m.version,
                                    peers = m.ipv4_peers.len(),
                                    "snapshot from ws"
                                );
                            } else {
                                tracing::warn!(%network_id, "ws snapshot missing enrolled network");
                            }
                        }
                        ServerMsg::Delta(delta) => {
                            tracing::info!(
                                v = delta.version,
                                added = delta.added.len(),
                                removed = delta.removed.len(),
                                "delta received"
                            );
                            version.store(Arc::new(delta.version));
                        }
                        ServerMsg::Policy(bundle) => {
                            acl.replace_bundle(bundle);
                        }
                        ServerMsg::ForceReenroll { reason } => {
                            tracing::error!(%reason, "control plane requested re-enrollment; exiting");
                            std::process::exit(2);
                        }
                        ServerMsg::Ping { nonce } => {
                            let _ = ws.tx.send(ClientMsg::Pong { nonce }).await;
                        }
                    }
                }
                _ = heartbeat.tick() => {
                    let _ = ws.tx.send(ClientMsg::Heartbeat {
                        active_conns: 0,
                        bytes_tx: 0,
                        bytes_rx: 0,
                    }).await;
                }
            }
        }
    });
}

fn spawn_poll_fallback(
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
