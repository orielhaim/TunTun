use std::sync::Arc;

use anyhow::Context;
use bytes::Bytes;
use tun_rs::{AsyncDevice, DeviceBuilder};
use tuntun_common::policy::Direction;
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

pub async fn run_outbound(
    tun: Arc<AsyncDevice>,
    routes: RoutingTable,
    pool: ConnPool,
    acl: AclEngine,
    metrics: AgentMetrics,
) -> anyhow::Result<()> {
    let mut buf = vec![0u8; 65_536];
    tracing::info!("outbound TUN→iroh loop started");
    loop {
        let n = tun.recv(&mut buf).await?;
        if n == 0 {
            continue;
        }
        let packet = &buf[..n];
        let Some(parsed) = ip::parse_ipv4(packet) else {
            metrics.dropped.with_label_values(&["non_ipv4"]).inc();
            continue;
        };

        if routes.is_advertised_destination(&parsed.dst) {
            metrics.dropped.with_label_values(&["local_subnet"]).inc();
            continue;
        }

        let Some(peer) = routes.lookup_ip(&parsed.dst) else {
            metrics.dropped.with_label_values(&["no_route"]).inc();
            continue;
        };
        if !acl.allow_packet(
            &peer.endpoint_hex,
            Some(parsed.dst),
            parsed.dst_port,
            parsed.protocol,
            Direction::Outbound,
        ) {
            metrics.dropped.with_label_values(&["policy_deny"]).inc();
            continue;
        }
        let payload = Bytes::copy_from_slice(packet);
        let n = payload.len() as u64;
        let pool = pool.clone();
        let peer_endpoint = peer.endpoint;
        let m = metrics.clone();
        tokio::spawn(async move {
            match pool.get(peer_endpoint).await {
                Ok(conn) => match send_datagram(&conn, payload) {
                    Ok(()) => {
                        m.packets.with_label_values(&["out"]).inc();
                        m.bytes.with_label_values(&["out"]).inc_by(n);
                    }
                    Err(e) => {
                        tracing::warn!(%peer_endpoint, ?e, "send_datagram failed");
                        m.dropped.with_label_values(&["send_failed"]).inc();
                    }
                },
                Err(e) => {
                    tracing::warn!(%peer_endpoint, ?e, "dial failed");
                    m.dropped.with_label_values(&["dial_failed"]).inc();
                }
            }
        });
    }
}

pub async fn run_inbound(
    endpoint: iroh::Endpoint,
    tun: Arc<AsyncDevice>,
    routes: RoutingTable,
    acl: AclEngine,
    metrics: AgentMetrics,
) -> anyhow::Result<()> {
    tracing::info!("inbound iroh→TUN accept loop started");
    while let Some(incoming) = endpoint.accept().await {
        let tun = tun.clone();
        let routes = routes.clone();
        let acl = acl.clone();
        let metrics = metrics.clone();
        tokio::spawn(async move {
            let conn = match incoming.await {
                Ok(c) => c,
                Err(e) => {
                    tracing::warn!(?e, "incoming handshake failed");
                    return;
                }
            };
            if conn.alpn() != tuntun_common::TUNNEL_ALPN {
                return;
            }
            let remote_id = conn.remote_id();
            let remote_hex = format!("{remote_id}");
            if !acl.allow_inbound_peer(&remote_hex) {
                tracing::warn!(%remote_id, "policy denied inbound peer");
                conn.close(1u32.into(), b"policy_deny");
                return;
            }
            tracing::info!(%remote_id, "peer connected");
            metrics.active_conns.inc();
            loop {
                match conn.read_datagram().await {
                    Ok(dg) => {
                        if let Some(parsed) = ip::parse_ipv4(&dg) {
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
                                metrics.dropped.with_label_values(&["policy_deny_in"]).inc();
                                continue;
                            }
                        }
                        let n = dg.len() as u64;
                        if let Err(e) = tun.send(&dg).await {
                            tracing::warn!(?e, "tun send failed");
                            metrics
                                .dropped
                                .with_label_values(&["tun_send_failed"])
                                .inc();
                            break;
                        }
                        metrics.packets.with_label_values(&["in"]).inc();
                        metrics.bytes.with_label_values(&["in"]).inc_by(n);
                    }
                    Err(e) => {
                        tracing::debug!(?e, "read_datagram closed");
                        break;
                    }
                }
            }
            metrics.active_conns.dec();
            tracing::info!(%remote_id, "peer disconnected");
        });
    }
    Ok(())
}
