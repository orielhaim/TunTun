//! PeerDNS stub resolver — answers A queries for mesh names and hostname routes,
//! forwards everything else to upstream resolvers.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::time::Duration;

use anyhow::Context;
use hickory_proto::op::{Message, MessageType, OpCode, ResponseCode};
use hickory_proto::rr::{Name, RData, Record, RecordType, rdata::A};
use hickory_proto::serialize::binary::{BinDecodable, BinEncodable};
use tokio::net::UdpSocket;
use tuntun_common::DnsConfig;

use crate::routing::RoutingTable;

const TTL_SECS: u32 = 30;

pub fn spawn(
    bind: SocketAddr,
    routes: RoutingTable,
    dns: DnsConfig,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        if let Err(e) = run(bind, routes, dns).await {
            tracing::error!(?e, %bind, "PeerDNS stub exited");
        }
    })
}

async fn bind_udp_with_retry(bind: SocketAddr) -> anyhow::Result<UdpSocket> {
    const ATTEMPTS: u32 = 20;
    let mut last_err = None;
    for attempt in 1..=ATTEMPTS {
        match UdpSocket::bind(bind).await {
            Ok(sock) => return Ok(sock),
            Err(e) => {
                tracing::debug!(?e, %bind, attempt, "PeerDNS bind retry");
                last_err = Some(e);
                tokio::time::sleep(Duration::from_millis(50 * u64::from(attempt))).await;
            }
        }
    }
    Err(last_err
        .map(Into::into)
        .unwrap_or_else(|| anyhow::anyhow!("PeerDNS bind failed")))
    .with_context(|| format!("bind PeerDNS UDP {bind}"))
}

async fn run(bind: SocketAddr, routes: RoutingTable, dns: DnsConfig) -> anyhow::Result<()> {
    // On Windows the TUN IP is often not bindable for a few hundred ms after
    // adapter create. Prefer 0.0.0.0:53 first — it still receives packets to
    // the overlay IP — then fall back to the TUN address with retries.
    let any = SocketAddr::from((Ipv4Addr::UNSPECIFIED, bind.port()));
    let sock = match UdpSocket::bind(any).await {
        Ok(s) => {
            tracing::info!(%any, via = %bind, suffix = %dns.suffix, "PeerDNS stub listening");
            s
        }
        Err(e) => {
            tracing::debug!(?e, %any, "PeerDNS wildcard bind failed; trying TUN IP");
            let s = bind_udp_with_retry(bind).await?;
            tracing::info!(%bind, suffix = %dns.suffix, "PeerDNS stub listening");
            s
        }
    };
    let sock = Arc::new(sock);
    let mut buf = vec![0u8; 4096];
    loop {
        let (n, peer) = sock.recv_from(&mut buf).await?;
        let request = buf[..n].to_vec();
        let sock = sock.clone();
        let routes = routes.clone();
        let upstream = dns.upstream.clone();
        let suffix = dns.suffix.clone();
        tokio::spawn(async move {
            if let Err(e) = handle_query(sock, peer, &request, &routes, &suffix, &upstream).await {
                tracing::debug!(?e, %peer, "dns query failed");
            }
        });
    }
}

async fn handle_query(
    sock: Arc<UdpSocket>,
    peer: SocketAddr,
    bytes: &[u8],
    routes: &RoutingTable,
    suffix: &str,
    upstream: &[IpAddr],
) -> anyhow::Result<()> {
    let query = Message::from_bytes(bytes).context("decode dns")?;
    if query.message_type() != MessageType::Query || query.op_code() != OpCode::Query {
        return Ok(());
    }
    let Some(question) = query.queries().first() else {
        return Ok(());
    };
    let name = question.name().to_string();
    let qtype = question.query_type();

    let our_zone = name_in_suffix(&name, suffix)
        || routes
            .lookup_hostname_route(name.trim_end_matches('.'))
            .is_some();

    if our_zone && (qtype == RecordType::A || qtype == RecordType::AAAA) {
        let mut response = Message::new();
        response.set_id(query.id());
        response.set_message_type(MessageType::Response);
        response.set_op_code(OpCode::Query);
        response.set_recursion_desired(query.recursion_desired());
        response.set_recursion_available(true);
        response.add_query(question.clone());

        if qtype == RecordType::A {
            if let Some(ip) = routes.resolve_dns_a(&name) {
                let rr = Record::from_rdata(
                    Name::from_utf8(name.trim_end_matches('.')).unwrap_or_else(|_| Name::root()),
                    TTL_SECS,
                    RData::A(A(ip)),
                );
                response.add_answer(rr);
                response.set_response_code(ResponseCode::NoError);
            } else {
                response.set_response_code(ResponseCode::NXDomain);
            }
        } else {
            // No AAAA yet — NODATA for our zone.
            response.set_response_code(ResponseCode::NoError);
        }

        let out = response.to_bytes().context("encode dns")?;
        sock.send_to(&out, peer).await?;
        return Ok(());
    }

    // Forward non-mesh queries upstream.
    if let Some(answer) = forward_upstream(bytes, upstream).await? {
        sock.send_to(&answer, peer).await?;
    }
    Ok(())
}

fn name_in_suffix(name: &str, suffix: &str) -> bool {
    let lower = name.trim_end_matches('.').to_ascii_lowercase();
    lower == suffix || lower.ends_with(&format!(".{suffix}"))
}

async fn forward_upstream(query: &[u8], upstream: &[IpAddr]) -> anyhow::Result<Option<Vec<u8>>> {
    if upstream.is_empty() {
        return Ok(None);
    }
    for addr in upstream {
        let target = SocketAddr::new(*addr, 53);
        let Ok(sock) = UdpSocket::bind("0.0.0.0:0").await else {
            continue;
        };
        if sock.send_to(query, target).await.is_err() {
            continue;
        }
        let mut buf = vec![0u8; 4096];
        match tokio::time::timeout(Duration::from_secs(2), sock.recv_from(&mut buf)).await {
            Ok(Ok((n, _))) => return Ok(Some(buf[..n].to_vec())),
            _ => continue,
        }
    }
    Ok(None)
}

/// Bind address for the stub on the TUN IP.
pub fn bind_addr(tun_ip: Ipv4Addr) -> SocketAddr {
    SocketAddr::from((tun_ip, 53))
}
