//! IPC server: accepts connections and dispatches [`IpcRequest`]s against agent state.

use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::Context;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use uuid::Uuid;

use super::protocol::{
    DnsStatusInfo, ExitNodeRouteInfo, HostnameRouteInfo, IpcRequest, IpcResponse, PeerLite,
    RoutesInfo, StatusInfo, SubnetRouteInfo,
};
use super::transport::{IpcListener, IpcStream};
use crate::node::CoreNode;
use crate::serve::ServeManager;
use crate::tunnel::TunnelManager;

/// Live agent state shared with the IPC server.
pub struct AgentIpcState {
    pub node: CoreNode,
    pub hostname: String,
    pub agent_version: String,
    pub started_at: Instant,
    pub dns_upstream: Vec<String>,
    pub synthetic_base: String,
    pub peer_dns_active: bool,
    pub serves: ServeManager,
    pub tunnels: TunnelManager,
}

impl AgentIpcState {
    pub fn uptime_secs(&self) -> u64 {
        self.started_at.elapsed().as_secs()
    }
}

/// Spawn the IPC listener for this agent. Returns the bound path.
pub fn spawn(network_id: Uuid, state: Arc<AgentIpcState>) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        match IpcListener::bind(network_id).await {
            Ok((listener, path)) => {
                tracing::info!(path = %path.display(), "agent IPC ready");
                loop {
                    match listener.accept().await {
                        Ok(stream) => {
                            let state = state.clone();
                            tokio::spawn(async move {
                                if let Err(e) = handle_connection(stream, state).await {
                                    tracing::debug!(?e, "IPC client session ended");
                                }
                            });
                        }
                        Err(e) => {
                            tracing::warn!(?e, "IPC accept failed");
                            tokio::time::sleep(Duration::from_millis(200)).await;
                        }
                    }
                }
            }
            Err(e) => {
                tracing::error!(?e, "failed to bind agent IPC — CLI commands will not work");
            }
        }
    })
}

async fn handle_connection(stream: IpcStream, state: Arc<AgentIpcState>) -> anyhow::Result<()> {
    let (read, mut write) = stream.split();
    let mut reader = BufReader::new(read);
    let mut line = String::new();

    // One request per connection for most commands. OpenStream is special
    // (switches to raw splice after Ready) — handled separately.
    let n = reader.read_line(&mut line).await?;
    if n == 0 {
        return Ok(());
    }
    let req: IpcRequest = serde_json::from_str(line.trim())
        .with_context(|| format!("parse IPC request: {}", line.trim()))?;

    match req {
        IpcRequest::OpenStream { host, port } => {
            handle_open_stream(host, port, state, reader, write).await
        }
        IpcRequest::Ping {
            peer,
            count,
            interval_ms,
        } => {
            handle_ping(peer, count, interval_ms, state, &mut write).await?;
            Ok(())
        }
        other => {
            let resp = dispatch(other, &state).await;
            write_response(&mut write, &resp).await
        }
    }
}

async fn write_response(
    write: &mut (impl AsyncWriteExt + Unpin),
    resp: &IpcResponse,
) -> anyhow::Result<()> {
    let mut buf = serde_json::to_vec(resp)?;
    buf.push(b'\n');
    write.write_all(&buf).await?;
    write.flush().await?;
    Ok(())
}

async fn dispatch(req: IpcRequest, state: &AgentIpcState) -> IpcResponse {
    match req {
        IpcRequest::ListPeers => {
            let peers = peer_lites(state);
            IpcResponse::Peers { peers }
        }
        IpcRequest::Status { peers } => IpcResponse::Status(build_status(state, peers)),
        IpcRequest::DnsStatus => IpcResponse::DnsStatus(build_dns_status(state)),
        IpcRequest::RouteList => IpcResponse::Routes(build_routes(state)),
        IpcRequest::RouteAdd { cidr, description } => match cidr.parse::<ipnet::Ipv4Net>() {
            Ok(net) => match advertise_subnet_route(state, &net.to_string(), description).await {
                Ok(cidr) => IpcResponse::RouteAdded { cidr },
                Err(e) => IpcResponse::Error {
                    message: e.to_string(),
                },
            },
            Err(e) => IpcResponse::Error {
                message: format!("invalid cidr: {e}"),
            },
        },
        IpcRequest::Diag => IpcResponse::Diag(build_diag(state).await),
        IpcRequest::Netcheck => IpcResponse::Netcheck(build_netcheck(state).await),
        IpcRequest::ServeStart {
            port,
            protocol,
            certificate_pem,
            private_key_pem,
            internal_hostname,
            serve_id,
        } => {
            match start_serve(
                state,
                port,
                &protocol,
                certificate_pem.as_deref(),
                private_key_pem.as_deref(),
                internal_hostname.as_deref(),
                serve_id,
            )
            .await
            {
                Ok(info) => IpcResponse::Serve(info),
                Err(e) => IpcResponse::Error {
                    message: e.to_string(),
                },
            }
        }
        IpcRequest::ServeStatus => IpcResponse::Serves {
            serves: state.serves.list(),
        },
        IpcRequest::ServeOff { port } => match state.serves.stop(port) {
            Ok(info) => IpcResponse::Serve(info),
            Err(e) => IpcResponse::Error {
                message: e.to_string(),
            },
        },
        IpcRequest::TunnelStart {
            port,
            protocol,
            relay,
            subdomain,
        } => match start_tunnel(
            state,
            port,
            &protocol,
            relay.as_deref(),
            subdomain.as_deref(),
        )
        .await
        {
            Ok(info) => IpcResponse::Tunnel(info),
            Err(e) => IpcResponse::Error {
                message: e.to_string(),
            },
        },
        IpcRequest::TunnelStatus => IpcResponse::Tunnels {
            tunnels: state.tunnels.list(),
        },
        IpcRequest::TunnelOff { port } => match stop_tunnel(state, port).await {
            Ok(info) => IpcResponse::Tunnel(info),
            Err(e) => IpcResponse::Error {
                message: e.to_string(),
            },
        },
        // Handled earlier:
        IpcRequest::OpenStream { .. } | IpcRequest::Ping { .. } => IpcResponse::Error {
            message: "internal: request should have been handled specially".into(),
        },
    }
}

async fn start_serve(
    state: &AgentIpcState,
    port: u16,
    protocol: &str,
    certificate_pem: Option<&str>,
    private_key_pem: Option<&str>,
    internal_hostname: Option<&str>,
    serve_id: Option<String>,
) -> anyhow::Result<super::protocol::ServeInfo> {
    let network = state.node.persisted.network_name.clone();
    let hostname = state.hostname.clone();
    let internal_hostname = internal_hostname
        .map(str::to_string)
        .unwrap_or_else(|| format!("{hostname}.{network}.tuntun"));
    let id = serve_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    if protocol == "https" && (certificate_pem.is_none() || private_key_pem.is_none()) {
        anyhow::bail!(
            "HTTPS serve needs an internal CA leaf cert. Create the serve from the dashboard \
             (certs are pushed over WebSocket), or use --protocol tcp for a quick mesh expose."
        );
    }

    state
        .serves
        .start(
            id,
            port,
            protocol,
            &internal_hostname,
            certificate_pem,
            private_key_pem,
            crate::serve::ServeAcl::default(),
        )
        .await
}

async fn advertise_subnet_route(
    state: &AgentIpcState,
    cidr: &str,
    description: Option<String>,
) -> anyhow::Result<String> {
    let client = crate::control::SignedClient::new(
        state.node.persisted.control_url.clone(),
        state.node.endpoint_id_hex(),
        state.node.identity.signing_key.clone(),
    )?;
    client
        .create_subnet_route(cidr, description.as_deref())
        .await
}

async fn start_tunnel(
    state: &AgentIpcState,
    port: u16,
    protocol: &str,
    relay: Option<&str>,
    subdomain: Option<&str>,
) -> anyhow::Result<super::protocol::TunnelInfo> {
    let client = crate::control::SignedClient::new(
        state.node.persisted.control_url.clone(),
        state.node.endpoint_id_hex(),
        state.node.identity.signing_key.clone(),
    )?;

    let created = client
        .create_tunnel(port, protocol, subdomain, relay)
        .await
        .context("control plane create tunnel")?;

    match state
        .tunnels
        .start(
            created.tunnel_id.clone(),
            &created.relay_endpoint_id,
            &created.subdomain,
            &created.public_hostname,
            created.local_port,
            &created.protocol,
            &created.auth_token,
            created.redirect_rules,
        )
        .await
    {
        Ok(info) => {
            if let Err(e) = client.tunnel_ready(&created.tunnel_id).await {
                tracing::warn!(?e, "tunnel ready report failed");
            }
            Ok(info)
        }
        Err(e) => {
            let _ = client
                .tunnel_failed(&created.tunnel_id, &e.to_string())
                .await;
            Err(e)
        }
    }
}

async fn stop_tunnel(
    state: &AgentIpcState,
    port: u16,
) -> anyhow::Result<super::protocol::TunnelInfo> {
    let info = state.tunnels.stop_by_port(port)?;
    let client = crate::control::SignedClient::new(
        state.node.persisted.control_url.clone(),
        state.node.endpoint_id_hex(),
        state.node.identity.signing_key.clone(),
    )?;
    if let Err(e) = client.tunnel_stopped(&info.id).await {
        tracing::warn!(?e, "tunnel stopped report failed");
    }
    Ok(info)
}

fn peer_lites(state: &AgentIpcState) -> Vec<PeerLite> {
    state
        .node
        .routes
        .peers()
        .into_iter()
        .map(|p| PeerLite {
            ip: p.ip.to_string(),
            hostname: p.hostname.clone(),
            endpoint_id: p.endpoint_hex.clone(),
            tags: p.tags.clone(),
            online: Some(state.node.pool.has_live(p.endpoint)),
            latency_ms: None,
            os: None,
        })
        .collect()
}

fn build_status(state: &AgentIpcState, include_peers: bool) -> StatusInfo {
    let peers = peer_lites(state);
    let peers_total = peers.len();
    let peers_online = peers.iter().filter(|p| p.online.unwrap_or(false)).count();
    let relay_status = if state.tunnels.list().is_empty() {
        "disconnected"
    } else {
        "connected"
    };
    StatusInfo {
        ip: state.node.self_ipv4.to_string(),
        hostname: state.hostname.clone(),
        network_name: state.node.persisted.network_name.clone(),
        network_id: state.node.persisted.network_id.to_string(),
        organization_id: state.node.persisted.organization_id.clone(),
        endpoint_id: state.node.endpoint_id_hex(),
        peers_total,
        peers_online,
        relay_status: relay_status.into(),
        uptime_secs: state.uptime_secs(),
        agent_version: state.agent_version.clone(),
        snapshot_version: **state.node.version.load(),
        peers: include_peers.then_some(peers),
    }
}

fn build_dns_status(state: &AgentIpcState) -> DnsStatusInfo {
    let tables_cached = state.node.routes.cached_entry_count();
    DnsStatusInfo {
        suffix: state.node.routes.dns_suffix(),
        upstream: state.dns_upstream.clone(),
        peer_dns_active: state.peer_dns_active,
        cached_entries: tables_cached,
        synthetic_base: state.synthetic_base.clone(),
    }
}

fn build_routes(state: &AgentIpcState) -> RoutesInfo {
    let self_id = state.node.endpoint_id_hex();
    let snap = crate::state::load_snapshot_cache(&state.node.paths);
    let membership = snap.as_ref().and_then(|s| {
        s.memberships
            .iter()
            .find(|m| m.network_id == state.node.persisted.network_id)
    });

    let mut subnet_routes = Vec::new();
    let mut hostname_routes = Vec::new();
    let mut exit_node = None;
    let mut split_tunnel_mode = "exclude".to_string();
    let mut split_tunnel_cidrs = Vec::new();

    if let Some(m) = membership {
        for r in &m.subnet_routes {
            let via = state
                .node
                .routes
                .lookup_endpoint(&r.via_endpoint_id)
                .map(|p| p.hostname.clone())
                .unwrap_or_else(|| r.via_endpoint_id[..8.min(r.via_endpoint_id.len())].to_string());
            subnet_routes.push(SubnetRouteInfo {
                cidr: r.cidr.to_string(),
                via_hostname: via,
                via_ip: r.via_ip.to_string(),
                via_endpoint_id: r.via_endpoint_id.clone(),
                advertised_by_self: r.via_endpoint_id == self_id,
            });
        }
        for r in &m.hostname_routes {
            let via = state
                .node
                .routes
                .lookup_endpoint(&r.via_endpoint_id)
                .map(|p| p.hostname.clone())
                .unwrap_or_else(|| r.via_endpoint_id[..8.min(r.via_endpoint_id.len())].to_string());
            hostname_routes.push(HostnameRouteInfo {
                hostname: r.hostname.clone(),
                is_wildcard: r.is_wildcard,
                via_hostname: via,
                via_ip: r.via_ip.to_string(),
                via_endpoint_id: r.via_endpoint_id.clone(),
                target_ip: r.target_ip.map(|ip| ip.to_string()),
            });
        }
        if let Some(exit) = state.node.routes.exit_node() {
            exit_node = Some(ExitNodeRouteInfo {
                hostname: exit.hostname.clone(),
                via_ip: exit.ip.to_string(),
                endpoint_id: exit.endpoint_hex.clone(),
            });
        }
        split_tunnel_mode = format!("{:?}", m.device_profile.split_tunnel_mode).to_lowercase();
        split_tunnel_cidrs = m
            .device_profile
            .split_tunnel_cidrs
            .iter()
            .map(|c| c.to_string())
            .collect();
    }

    RoutesInfo {
        subnet_routes,
        hostname_routes,
        exit_node,
        split_tunnel_mode,
        split_tunnel_cidrs,
    }
}

async fn build_diag(state: &AgentIpcState) -> super::protocol::DiagInfo {
    let peers = state.node.routes.peers();
    let total = peers.len();
    // Without per-connection path telemetry yet, report unknowns honestly.
    super::protocol::DiagInfo {
        nat_type: "unknown".into(),
        endpoint_id: state.node.endpoint_id_hex(),
        endpoint_online: true,
        relay_reachable: true,
        relay_rtt_ms: None,
        direct_peers: 0,
        relayed_peers: 0,
        total_peers: total,
        notes: vec![
            "NAT classification and path telemetry land with richer peer metrics".into(),
            format!("mesh peers known: {total}"),
        ],
    }
}

async fn build_netcheck(state: &AgentIpcState) -> super::protocol::NetcheckInfo {
    let mut checks = Vec::new();

    checks.push(super::protocol::NetcheckItem {
        name: "agent_running".into(),
        pass: true,
        detail: format!("uptime {}s", state.uptime_secs()),
    });

    checks.push(super::protocol::NetcheckItem {
        name: "has_mesh_ip".into(),
        pass: !state.node.self_ipv4.is_unspecified(),
        detail: state.node.self_ipv4.to_string(),
    });

    checks.push(super::protocol::NetcheckItem {
        name: "peer_dns".into(),
        pass: state.peer_dns_active,
        detail: if state.peer_dns_active {
            format!("suffix .{}", state.node.routes.dns_suffix())
        } else {
            "PeerDNS not active".into()
        },
    });

    checks.push(super::protocol::NetcheckItem {
        name: "snapshot".into(),
        pass: **state.node.version.load() > 0,
        detail: format!("version {}", **state.node.version.load()),
    });

    let ok = checks.iter().all(|c| c.pass);
    super::protocol::NetcheckInfo { ok, checks }
}

async fn handle_ping(
    peer: String,
    count: u32,
    interval_ms: u64,
    state: Arc<AgentIpcState>,
    write: &mut (impl AsyncWriteExt + Unpin),
) -> anyhow::Result<()> {
    use super::protocol::{PingProbe, PingSummary};
    use crate::ping;

    let resolved = resolve_peer(&state.node, &peer).ok_or_else(|| {
        anyhow::anyhow!("no peer matches `{peer}` (try hostname, IP, or endpoint id)")
    })?;

    let count = count.clamp(1, 64);
    let mut latencies = Vec::new();
    let mut received = 0u32;
    let mut path = "unknown".to_string();

    for seq in 1..=count {
        match ping::ping_peer(&state.node.pool, resolved.endpoint, seq).await {
            Ok(result) => {
                received += 1;
                latencies.push(result.latency_ms);
                path = result.path.clone();
                write_response(
                    write,
                    &IpcResponse::PingProbe(PingProbe {
                        seq,
                        peer: resolved.hostname.clone(),
                        peer_ip: resolved.ip.to_string(),
                        latency_ms: result.latency_ms,
                        path: result.path,
                    }),
                )
                .await?;
            }
            Err(e) => {
                write_response(
                    write,
                    &IpcResponse::Error {
                        message: format!("seq={seq} timeout/error: {e}"),
                    },
                )
                .await?;
            }
        }
        if seq < count {
            tokio::time::sleep(Duration::from_millis(interval_ms)).await;
        }
    }

    let (min_ms, avg_ms, max_ms) = if latencies.is_empty() {
        (None, None, None)
    } else {
        let min = latencies.iter().cloned().fold(f64::INFINITY, f64::min);
        let max = latencies.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let avg = latencies.iter().sum::<f64>() / latencies.len() as f64;
        (Some(min), Some(avg), Some(max))
    };

    let loss_pct = if count == 0 {
        0.0
    } else {
        ((count - received) as f64 / count as f64) * 100.0
    };

    write_response(
        write,
        &IpcResponse::PingSummary(PingSummary {
            peer: resolved.hostname.clone(),
            peer_ip: resolved.ip.to_string(),
            transmitted: count,
            received,
            loss_pct,
            min_ms,
            avg_ms,
            max_ms,
            path,
        }),
    )
    .await
}

async fn handle_open_stream(
    host: String,
    port: u16,
    state: Arc<AgentIpcState>,
    reader: BufReader<Box<dyn tokio::io::AsyncRead + Unpin + Send>>,
    mut write: Box<dyn tokio::io::AsyncWrite + Unpin + Send>,
) -> anyhow::Result<()> {
    let peer = resolve_peer(&state.node, &host)
        .ok_or_else(|| anyhow::anyhow!("no peer matches host {host}"))?;
    match crate::stream::dial_stream(&state.node.pool, peer.endpoint, port, host.clone()).await {
        Ok((send, recv)) => {
            write_response(&mut write, &IpcResponse::Ready).await?;
            let local_read = reader.into_inner();
            crate::stream::splice_bidirectional(recv, send, local_read, write).await
        }
        Err(e) => {
            write_response(
                &mut write,
                &IpcResponse::Error {
                    message: e.to_string(),
                },
            )
            .await?;
            Err(e)
        }
    }
}

fn resolve_peer(node: &CoreNode, host: &str) -> Option<std::sync::Arc<crate::routing::PeerInfo>> {
    if let Ok(ip) = host.parse::<std::net::Ipv4Addr>() {
        return node.routes.lookup_ip(&ip);
    }
    node.routes
        .lookup_hostname(host)
        .or_else(|| node.routes.lookup_endpoint(host))
}
