use std::sync::Arc;

use anyhow::Context;
use bytes::Bytes;
use iroh::endpoint::Connection;
use tun_rs::{AsyncDevice, DeviceBuilder};
use tuntun_common::policy::Direction;
use tuntun_core::direct::{
    EvalResult, FirewallEngine, PacketDirection, SpoofTracker, source_matches_peer,
};
use tuntun_core::{AclEngine, ConnPool, RoutingTable, iroh_pool::send_datagram};

use crate::ip;
use crate::metrics::AgentMetrics;

pub fn build_tun(
    ifname: &str,
    ipv4: std::net::Ipv4Addr,
    prefix: u8,
    mtu: u16,
    #[cfg(windows)] wintun_file: Option<&str>,
) -> anyhow::Result<AsyncDevice> {
    let builder = DeviceBuilder::new()
        .name(ifname)
        .ipv4(ipv4, prefix, None)
        .mtu(mtu);
    #[cfg(windows)]
    let builder = {
        use crate::wintun_path;
        let path = wintun_path::resolve(wintun_file);
        tracing::info!(path = %path.display(), "loading wintun.dll");
        builder
            .wintun_file(path.display().to_string())
            .wintun_log(true)
    };
    let dev = builder.build_async().context("build_async TUN device")?;
    tracing::info!(%ipv4, prefix, mtu, "TUN device up");
    Ok(dev)
}

pub struct OutboundDeps {
    pub tun: Arc<AsyncDevice>,
    pub routes: RoutingTable,
    pub pool: ConnPool,
    pub acl: AclEngine,
    pub firewall: Option<FirewallEngine>,
    pub metrics: AgentMetrics,
}

pub async fn run_outbound(deps: OutboundDeps) -> anyhow::Result<()> {
    let OutboundDeps {
        tun,
        routes,
        pool,
        acl,
        firewall,
        metrics,
    } = deps;
    let mut buf = vec![0u8; 65_536];
    tracing::info!("outbound TUN→iroh loop started");
    loop {
        let n = tun.recv(&mut buf).await?;
        if n == 0 {
            continue;
        }
        let packet = &buf[..n];
        let Some(parsed) = ip::parse_ipv4(packet) else {
            metrics.dropped_inc("non_ipv4");
            continue;
        };

        // PeerDNS magic IP is local - never mesh-forward.
        if routes.is_magic_dns_destination(&parsed.dst) {
            metrics.dropped_inc("magic_dns_local");
            continue;
        }

        if routes.is_advertised_destination(&parsed.dst) {
            metrics.dropped_inc("local_subnet");
            continue;
        }

        let Some(peer) = routes.lookup_ip(&parsed.dst) else {
            metrics.dropped_inc("no_route");
            continue;
        };

        // Connection-level ACL (Managed + Direct peer accept).
        if !acl.allow_packet(
            &peer.endpoint_hex,
            Some(parsed.dst),
            parsed.dst_port,
            parsed.protocol,
            Direction::Outbound,
        ) {
            metrics.dropped_inc("policy_deny");
            continue;
        }

        // Direct userspace firewall (packet path).
        if let Some(fw) = &firewall {
            match fw.evaluate(
                PacketDirection::Outbound,
                packet,
                Some(&peer.endpoint_hex),
                Some(&peer.hostname),
            ) {
                EvalResult::Allow => {}
                EvalResult::Deny => {
                    metrics.dropped_inc("fw_deny_out");
                    continue;
                }
                EvalResult::Reject { reply } => {
                    metrics.dropped_inc("fw_reject_out");
                    if !reply.is_empty() {
                        let _ = tun.send(&reply).await;
                    }
                    continue;
                }
            }
        }

        let payload = Bytes::copy_from_slice(packet);
        let n = payload.len() as u64;
        let pool = pool.clone();
        let peer_endpoint = peer.endpoint;
        let m = metrics.clone();
        tokio::spawn(async move {
            match pool.send_or_buffer(peer_endpoint, payload).await {
                Ok(()) => {
                    m.packets_inc("out");
                    m.bytes_add("out", n);
                    pool.record_bytes_out(peer_endpoint, n);
                }
                Err(e) => {
                    tracing::warn!(%peer_endpoint, ?e, "send/buffer failed");
                    m.dropped_inc("send_failed");
                }
            }
        });
    }
}

/// Handle an already-accepted connection negotiated with [`tuntun_common::TUNNEL_ALPN`].
pub struct InboundDeps {
    pub conn: Connection,
    pub tun: Arc<AsyncDevice>,
    pub routes: RoutingTable,
    pub acl: AclEngine,
    pub firewall: Option<FirewallEngine>,
    pub spoof: Option<SpoofTracker>,
    pub pool: Option<ConnPool>,
    pub metrics: AgentMetrics,
}

pub async fn serve_tunnel_connection(deps: InboundDeps) {
    let InboundDeps {
        conn,
        tun,
        routes,
        acl,
        firewall,
        spoof,
        pool,
        metrics,
    } = deps;
    let remote_id = conn.remote_id();
    let remote_hex = format!("{remote_id}");
    if !acl.allow_inbound_peer(&remote_hex) {
        tracing::warn!(%remote_id, "policy denied inbound peer");
        conn.close(1u32.into(), b"policy_deny");
        return;
    }
    tracing::info!(%remote_id, "peer connected");
    metrics.active_conns_inc();
    if let Some(p) = &pool {
        p.touch_peer(remote_id);
    }
    loop {
        match conn.read_datagram().await {
            Ok(dg) => {
                if let Some(p) = &pool {
                    p.touch_peer(remote_id);
                }

                let Some(parsed) = ip::parse_ipv4(&dg) else {
                    metrics.dropped_inc("non_ipv4_in");
                    continue;
                };

                // Anti-spoof: source IP must match this peer's mesh IP.
                if let Some(peer_info) = routes.lookup_endpoint(&remote_hex)
                    && !source_matches_peer(parsed.src, peer_info.ip)
                {
                    metrics.dropped_inc("antispoof");
                    if let Some(tracker) = &spoof
                        && tracker.record(&remote_hex)
                    {
                        let counts = tracker.drain_window_counts();
                        for (peer, n) in counts {
                            tracing::warn!(
                                peer = %peer,
                                spoofed_packets = n,
                                "ingress anti-spoof drops in last window"
                            );
                        }
                    }
                    continue;
                }

                // Connection-level ACL.
                let dst_for_acl = if routes.is_advertised_destination(&parsed.dst) {
                    Some(parsed.dst)
                } else {
                    Some(parsed.src)
                };
                if !acl.allow_packet(
                    &remote_hex,
                    dst_for_acl,
                    parsed.dst_port,
                    parsed.protocol,
                    Direction::Inbound,
                ) {
                    metrics.dropped_inc("policy_deny_in");
                    continue;
                }

                // Direct userspace firewall.
                if let Some(fw) = &firewall {
                    let hostname = routes
                        .lookup_endpoint(&remote_hex)
                        .map(|p| p.hostname.clone());
                    match fw.evaluate(
                        PacketDirection::Inbound,
                        &dg,
                        Some(&remote_hex),
                        hostname.as_deref(),
                    ) {
                        EvalResult::Allow => {}
                        EvalResult::Deny => {
                            metrics.dropped_inc("fw_deny_in");
                            continue;
                        }
                        EvalResult::Reject { reply } => {
                            metrics.dropped_inc("fw_reject_in");
                            if !reply.is_empty() {
                                let _ = send_datagram(&conn, reply);
                            }
                            continue;
                        }
                    }
                }

                let n = dg.len() as u64;
                if let Err(e) = tun.send(&dg).await {
                    tracing::warn!(?e, "tun send failed");
                    metrics.dropped_inc("tun_send_failed");
                    break;
                }
                metrics.packets_inc("in");
                metrics.bytes_add("in", n);
                if let Some(p) = &pool {
                    p.record_bytes_in(remote_id, n);
                }
            }
            Err(e) => {
                tracing::debug!(?e, "read_datagram closed");
                break;
            }
        }
    }
    metrics.active_conns_dec();
    tracing::info!(%remote_id, "peer disconnected");
}
