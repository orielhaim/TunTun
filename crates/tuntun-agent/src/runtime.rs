use std::sync::Arc;
use std::time::Instant;

use anyhow::Context;
use tuntun_common::TUNNEL_ALPN;
use tuntun_core::ipc::{AgentIpcState, spawn_ipc_server};
use tuntun_core::{CoreNode, CoreNodeConfig};

use crate::cli::RunArgs;
use crate::metrics::AgentMetrics;
use crate::tun_io::{build_tun, run_inbound, run_outbound};

pub async fn run(
    identity: tuntun_core::AgentIdentity,
    persisted: tuntun_core::PersistedState,
    paths: tuntun_core::StatePaths,
    args: RunArgs,
) -> anyhow::Result<()> {
    let metrics = AgentMetrics::new().context("metrics")?;
    let started_at = Instant::now();

    let hostname = std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "tuntun-agent".into());
    let node = CoreNode::bootstrap(
        identity,
        persisted,
        paths,
        CoreNodeConfig {
            hostname: hostname.clone(),
            agent_version: env!("CARGO_PKG_VERSION"),
            poll_secs: args.poll_secs,
            advertise_datagram_alpn: true, // agent tunnels raw IP over datagrams
            kind: "agent",
        },
    )
    .await?;

    #[cfg(windows)]
    let wintun_file = args.wintun_file.as_deref();

    let membership_snap = tuntun_core::state::load_snapshot_cache(&node.paths)
        .and_then(|s| {
            s.memberships
                .into_iter()
                .find(|m| m.network_id == node.persisted.network_id)
        })
        .context("cached snapshot missing enrolled network")?;

    let tun = Arc::new(build_tun(
        &args.ifname,
        membership_snap.assigned_ipv4,
        membership_snap.prefix,
        membership_snap.mtu,
        #[cfg(windows)]
        wintun_file,
    )?);

    crate::forward::ensure_ip_forwarding(!node.routes.advertised_subnets().is_empty());
    crate::stream_proxy::spawn(node.endpoint.clone(), node.routes.clone());

    let dns_cfg = membership_snap.dns.clone();
    let dns_bind = tuntun_core::dns_stub::bind_addr(membership_snap.assigned_ipv4);
    let _dns_task = tuntun_core::dns_stub::spawn(dns_bind, node.routes.clone(), dns_cfg.clone());
    let dns_guard =
        match crate::system_dns::configure(membership_snap.assigned_ipv4, &dns_cfg.suffix) {
            Ok(g) => Some(g),
            Err(e) => {
                tracing::warn!(?e, "PeerDNS system configuration skipped");
                None
            }
        };

    let ipc_state = Arc::new(AgentIpcState {
        node: node.clone(),
        hostname: hostname.clone(),
        agent_version: env!("CARGO_PKG_VERSION").to_string(),
        started_at,
        dns_upstream: dns_cfg.upstream.iter().map(|ip| ip.to_string()).collect(),
        synthetic_base: dns_cfg.synthetic_base.to_string(),
        peer_dns_active: dns_guard.is_some(),
        serves: node.serves.clone(),
        tunnels: node.tunnels.clone(),
    });
    let _ipc_task = spawn_ipc_server(node.persisted.network_id, ipc_state);

    let remote_subnets: Vec<ipnet::Ipv4Net> = membership_snap
        .subnet_routes
        .iter()
        .filter(|r| r.via_endpoint_id != node.identity.endpoint_id_hex())
        .map(|r| r.cidr)
        .collect();
    crate::system_routes::apply(
        &args.ifname,
        &membership_snap.device_profile,
        &remote_subnets,
        membership_snap
            .device_profile
            .exit_node_endpoint_id
            .is_some(),
    );

    crate::metrics::spawn_listeners(
        metrics.clone(),
        &args.metrics_bind,
        membership_snap.assigned_ipv4,
    );

    // Datagram-ALPN pool (agent-specific).
    let dgram_pool = tuntun_core::ConnPool::new(node.endpoint.clone(), TUNNEL_ALPN);

    let outbound = {
        let tun = tun.clone();
        let routes = node.routes.clone();
        let pool = dgram_pool.clone();
        let acl = node.acl.clone();
        let metrics = metrics.clone();
        tokio::spawn(async move {
            if let Err(e) = run_outbound(tun, routes, pool, acl, metrics).await {
                tracing::error!(?e, "outbound crashed");
            }
        })
    };
    let inbound = {
        let ep = node.endpoint.clone();
        let tun = tun.clone();
        let routes = node.routes.clone();
        let acl = node.acl.clone();
        let metrics = metrics.clone();
        tokio::spawn(async move {
            if let Err(e) = run_inbound(ep, tun, routes, acl, metrics).await {
                tracing::error!(?e, "inbound crashed");
            }
        })
    };

    if !args.disable_gossip {
        let gossip = iroh_gossip::Gossip::builder().spawn(node.endpoint.clone());
        let peers: Vec<iroh::EndpointId> = node
            .routes
            .peers()
            .iter()
            .take(5)
            .filter_map(|p| p.endpoint_hex.parse().ok())
            .collect();
        let topic = tuntun_common::network_topic_hex(&node.persisted.network_id);
        let ep = node.endpoint.clone();
        let hostname = hostname.clone();
        tokio::spawn(async move {
            if let Err(e) = crate::gossip_presence::spawn(ep, gossip, topic, peers, hostname).await
            {
                tracing::warn!(?e, "gossip presence disabled");
            }
        });
    }

    tokio::select! {
        _ = outbound => tracing::error!("outbound task exited"),
        _ = inbound  => tracing::error!("inbound task exited"),
        _ = tokio::signal::ctrl_c() => tracing::info!("ctrl-c, shutting down"),
    }

    drop(dns_guard);
    node.shutdown().await;
    Ok(())
}
