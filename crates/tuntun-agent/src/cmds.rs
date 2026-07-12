//! Rich CLI subcommands that talk to the running agent over IPC.

use anyhow::Context;
use clap::Args;
use tuntun_core::ipc::protocol::{IpcRequest, IpcResponse, PingProbe, PingSummary, StatusInfo};
use tuntun_core::ipc::{IpcClient, discover_network_id};

use crate::output::{self, Output};

#[derive(Args, Debug)]
pub struct StatusArgs {
    /// Include peer table
    #[arg(long)]
    pub peers: bool,
    #[arg(long)]
    pub json: bool,
    #[arg(long, env = "TUNTUN_STATE_DIR")]
    pub state_dir: Option<String>,
}

#[derive(Args, Debug)]
pub struct PingArgs {
    /// Peer hostname, mesh IP, or endpoint id
    pub peer: String,
    #[arg(short = 'c', long, default_value_t = 4)]
    pub count: u32,
    #[arg(short = 'i', long, default_value_t = 1.0)]
    pub interval: f64,
    #[arg(long)]
    pub json: bool,
    #[arg(long, env = "TUNTUN_STATE_DIR")]
    pub state_dir: Option<String>,
}

#[derive(Args, Debug)]
pub struct DnsStatusArgs {
    #[arg(long)]
    pub json: bool,
    #[arg(long, env = "TUNTUN_STATE_DIR")]
    pub state_dir: Option<String>,
}

#[derive(Args, Debug)]
pub struct RouteListArgs {
    #[arg(long)]
    pub json: bool,
    #[arg(long, env = "TUNTUN_STATE_DIR")]
    pub state_dir: Option<String>,
}

#[derive(Args, Debug)]
pub struct RouteAddArgs {
    pub cidr: String,
    #[arg(long)]
    pub description: Option<String>,
    #[arg(long)]
    pub json: bool,
    #[arg(long, env = "TUNTUN_STATE_DIR")]
    pub state_dir: Option<String>,
}

#[derive(Args, Debug)]
pub struct DiagArgs {
    #[arg(long)]
    pub json: bool,
    #[arg(long, env = "TUNTUN_STATE_DIR")]
    pub state_dir: Option<String>,
}

#[derive(Args, Debug)]
pub struct NetcheckArgs {
    #[arg(long)]
    pub json: bool,
    #[arg(long, env = "TUNTUN_STATE_DIR")]
    pub state_dir: Option<String>,
}

async fn client(state_dir: Option<&str>) -> anyhow::Result<IpcClient> {
    let (network_id, _) = discover_network_id(state_dir)?;
    Ok(IpcClient::for_network(network_id))
}

pub async fn run_status(args: StatusArgs) -> anyhow::Result<()> {
    let out = Output::new(args.json);
    let ipc = client(args.state_dir.as_deref()).await?;
    let resp = ipc
        .request(IpcRequest::Status { peers: args.peers })
        .await?;
    let IpcResponse::Status(info) = resp else {
        anyhow::bail!("unexpected response from agent");
    };
    if out.json {
        return out.print_json(&info);
    }
    print_status(&out, &info);
    Ok(())
}

fn print_status(out: &Output, info: &StatusInfo) {
    let online = out.online_dot(true);
    out.writeln(format!(
        "{} {}  {}  {}",
        online,
        out.bold(&info.hostname),
        out.cyan(&info.ip),
        out.dim(&format!("· {}", info.network_name))
    ));
    out.writeln(format!(
        "  endpoint   {}",
        out.dim(&output::short_endpoint(&info.endpoint_id))
    ));
    out.writeln(format!(
        "  peers      {} online / {} total",
        info.peers_online, info.peers_total
    ));
    out.writeln(format!("  relay      {}", info.relay_status));
    out.writeln(format!(
        "  uptime     {}  ·  agent v{}  ·  snap {}",
        output::format_uptime(info.uptime_secs),
        info.agent_version,
        info.snapshot_version
    ));

    if let Some(peers) = &info.peers {
        out.writeln("");
        out.writeln(out.bold("Peers"));
        out.writeln(format!(
            "  {:<4} {:<20} {:<15} {:<14} {}",
            "", "HOSTNAME", "IP", "ENDPOINT", "LATENCY"
        ));
        for p in peers {
            let online = out.online_dot(p.online.unwrap_or(false));
            let lat = p
                .latency_ms
                .map(|ms| format!("{ms:.1} ms"))
                .unwrap_or_else(|| out.dim("—"));
            out.writeln(format!(
                "  {online:<4} {:<20} {:<15} {:<14} {lat}",
                truncate(&p.hostname, 20),
                p.ip,
                output::short_endpoint(&p.endpoint_id),
            ));
        }
    }
}

pub async fn run_ping(args: PingArgs) -> anyhow::Result<()> {
    let out = Output::new(args.json);
    let ipc = client(args.state_dir.as_deref()).await?;
    let interval_ms = (args.interval * 1000.0).max(50.0) as u64;

    if !out.json {
        out.writeln(format!("PING {} via TunTun mesh", out.bold(&args.peer)));
    }

    let mut probes: Vec<PingProbe> = Vec::new();
    let mut summary: Option<PingSummary> = None;

    ipc.request_stream(
        IpcRequest::Ping {
            peer: args.peer.clone(),
            count: args.count,
            interval_ms,
        },
        |resp| {
            match resp {
                IpcResponse::PingProbe(p) => {
                    if out.json {
                        probes.push(p);
                    } else {
                        out.writeln(format!(
                            "{} bytes from {} ({}): seq={} time={:.2} ms path={}",
                            8, p.peer, p.peer_ip, p.seq, p.latency_ms, p.path
                        ));
                    }
                }
                IpcResponse::PingSummary(s) => {
                    summary = Some(s);
                }
                IpcResponse::Error { message } if !out.json => {
                    out.writeln(out.red(&format!("  {message}")));
                }
                _ => {}
            }
            Ok(())
        },
    )
    .await?;

    if out.json {
        let payload = serde_json::json!({
            "probes": probes,
            "summary": summary,
        });
        return out.print_json(&payload);
    }

    if let Some(s) = summary {
        out.writeln("");
        out.writeln(format!("--- {} ping statistics ---", s.peer));
        out.writeln(format!(
            "{} transmitted, {} received, {:.1}% packet loss",
            s.transmitted, s.received, s.loss_pct
        ));
        if let (Some(min), Some(avg), Some(max)) = (s.min_ms, s.avg_ms, s.max_ms) {
            out.writeln(format!(
                "rtt min/avg/max = {:.2}/{:.2}/{:.2} ms  path={}",
                min, avg, max, s.path
            ));
        }
    }
    Ok(())
}

pub async fn run_dns_status(args: DnsStatusArgs) -> anyhow::Result<()> {
    let out = Output::new(args.json);
    let ipc = client(args.state_dir.as_deref()).await?;
    let resp = ipc.request(IpcRequest::DnsStatus).await?;
    let IpcResponse::DnsStatus(info) = resp else {
        anyhow::bail!("unexpected response");
    };
    if out.json {
        return out.print_json(&info);
    }
    let active = if info.peer_dns_active {
        out.green("active")
    } else {
        out.red("inactive")
    };
    out.writeln(format!("PeerDNS   {active}"));
    out.writeln(format!("suffix    .{}", info.suffix));
    out.writeln(format!(
        "upstream  {}",
        if info.upstream.is_empty() {
            out.dim("none")
        } else {
            info.upstream.join(", ")
        }
    ));
    out.writeln(format!("cache     {} entries", info.cached_entries));
    out.writeln(format!("synthetic {}", info.synthetic_base));
    Ok(())
}

pub async fn run_route_list(args: RouteListArgs) -> anyhow::Result<()> {
    let out = Output::new(args.json);
    let ipc = client(args.state_dir.as_deref()).await?;
    let resp = ipc.request(IpcRequest::RouteList).await?;
    let IpcResponse::Routes(info) = resp else {
        anyhow::bail!("unexpected response");
    };
    if out.json {
        return out.print_json(&info);
    }

    out.writeln(out.bold("Subnet routes"));
    if info.subnet_routes.is_empty() {
        out.writeln(out.dim("  (none)"));
    } else {
        for r in &info.subnet_routes {
            let self_tag = if r.advertised_by_self {
                out.yellow(" [self]")
            } else {
                String::new()
            };
            out.writeln(format!(
                "  {} via {} ({}){self_tag}",
                out.cyan(&r.cidr),
                r.via_hostname,
                r.via_ip
            ));
        }
    }

    out.writeln("");
    out.writeln(out.bold("Hostname routes"));
    if info.hostname_routes.is_empty() {
        out.writeln(out.dim("  (none)"));
    } else {
        for r in &info.hostname_routes {
            let name = if r.is_wildcard {
                format!("*.{}", r.hostname)
            } else {
                r.hostname.clone()
            };
            out.writeln(format!(
                "  {} via {} ({})",
                out.cyan(&name),
                r.via_hostname,
                r.via_ip
            ));
        }
    }

    out.writeln("");
    out.writeln(out.bold("Exit node"));
    match &info.exit_node {
        Some(e) => out.writeln(format!(
            "  {} ({}) {}",
            e.hostname,
            e.via_ip,
            out.dim(&output::short_endpoint(&e.endpoint_id))
        )),
        None => out.writeln(out.dim("  (none)")),
    }

    out.writeln("");
    out.writeln(format!(
        "Split tunnel: {} {}",
        info.split_tunnel_mode,
        if info.split_tunnel_cidrs.is_empty() {
            String::new()
        } else {
            format!("[{}]", info.split_tunnel_cidrs.join(", "))
        }
    ));
    Ok(())
}

pub async fn run_route_add(args: RouteAddArgs) -> anyhow::Result<()> {
    let out = Output::new(args.json);
    let ipc = client(args.state_dir.as_deref()).await?;
    let resp = ipc
        .request(IpcRequest::RouteAdd {
            cidr: args.cidr,
            description: args.description,
        })
        .await?;
    match resp {
        IpcResponse::RouteAdded { cidr } => {
            if out.json {
                out.print_json(&serde_json::json!({ "cidr": cidr, "status": "accepted" }))?;
            } else {
                out.writeln(format!(
                    "{} Route {} advertised to control plane",
                    out.green("✓"),
                    out.cyan(&cidr)
                ));
            }
            Ok(())
        }
        other => anyhow::bail!("unexpected response: {other:?}"),
    }
}

pub async fn run_diag(args: DiagArgs) -> anyhow::Result<()> {
    let out = Output::new(args.json);
    let ipc = client(args.state_dir.as_deref()).await?;
    let resp = ipc.request(IpcRequest::Diag).await?;
    let IpcResponse::Diag(info) = resp else {
        anyhow::bail!("unexpected response");
    };
    if out.json {
        return out.print_json(&info);
    }
    out.writeln(out.bold("Diagnostics"));
    out.writeln(format!("  NAT type          {}", info.nat_type));
    out.writeln(format!(
        "  Endpoint          {} ({})",
        output::short_endpoint(&info.endpoint_id),
        if info.endpoint_online {
            out.green("online")
        } else {
            out.red("offline")
        }
    ));
    out.writeln(format!(
        "  Relay             {}{}",
        if info.relay_reachable {
            out.green("reachable")
        } else {
            out.red("unreachable")
        },
        info.relay_rtt_ms
            .map(|ms| format!(" ({ms:.1} ms)"))
            .unwrap_or_default()
    ));
    out.writeln(format!(
        "  Peers             {} total · {} direct · {} relayed",
        info.total_peers, info.direct_peers, info.relayed_peers
    ));
    if !info.notes.is_empty() {
        out.writeln("");
        for n in &info.notes {
            out.writeln(format!("  {}", out.dim(&format!("· {n}"))));
        }
    }
    Ok(())
}

pub async fn run_netcheck(args: NetcheckArgs) -> anyhow::Result<()> {
    let out = Output::new(args.json);
    let ipc = client(args.state_dir.as_deref()).await?;
    let resp = ipc.request(IpcRequest::Netcheck).await?;
    let IpcResponse::Netcheck(info) = resp else {
        anyhow::bail!("unexpected response");
    };
    if out.json {
        return out.print_json(&info);
    }
    for c in &info.checks {
        let mark = if c.pass {
            out.green("PASS")
        } else {
            out.red("FAIL")
        };
        out.writeln(format!("  [{mark}] {:<16} {}", c.name, out.dim(&c.detail)));
    }
    out.writeln("");
    if info.ok {
        out.writeln(format!("{} netcheck passed", out.green("✓")));
    } else {
        out.writeln(format!("{} netcheck failed", out.red("✗")));
        std::process::exit(1);
    }
    Ok(())
}

#[derive(Args, Debug)]
pub struct ServeArgs {
    #[command(subcommand)]
    pub command: Option<ServeSubcommand>,
    /// Local port to expose (when starting without a subcommand)
    pub port: Option<u16>,
    #[arg(long, default_value = "tcp")]
    pub protocol: String,
    #[arg(long)]
    pub json: bool,
    #[arg(long, env = "TUNTUN_STATE_DIR")]
    pub state_dir: Option<String>,
}

#[derive(clap::Subcommand, Debug)]
pub enum ServeSubcommand {
    /// List active serves
    Status {
        #[arg(long)]
        json: bool,
        #[arg(long, env = "TUNTUN_STATE_DIR")]
        state_dir: Option<String>,
    },
    /// Stop serving a port
    Off {
        port: u16,
        #[arg(long)]
        json: bool,
        #[arg(long, env = "TUNTUN_STATE_DIR")]
        state_dir: Option<String>,
    },
}

pub async fn run_serve(args: ServeArgs) -> anyhow::Result<()> {
    match args.command {
        Some(ServeSubcommand::Status { json, state_dir }) => {
            run_serve_status(json, state_dir.as_deref()).await
        }
        Some(ServeSubcommand::Off {
            port,
            json,
            state_dir,
        }) => run_serve_off(port, json, state_dir.as_deref()).await,
        None => {
            let port = args.port.context(
                "usage: tuntun serve <port> | tuntun serve status | tuntun serve off <port>",
            )?;
            run_serve_start(port, &args.protocol, args.json, args.state_dir.as_deref()).await
        }
    }
}

async fn run_serve_start(
    port: u16,
    protocol: &str,
    json: bool,
    state_dir: Option<&str>,
) -> anyhow::Result<()> {
    let out = Output::new(json);
    let ipc = client(state_dir).await?;
    let resp = ipc
        .request(IpcRequest::ServeStart {
            port,
            protocol: protocol.to_string(),
            certificate_pem: None,
            private_key_pem: None,
            internal_hostname: None,
            serve_id: None,
        })
        .await?;
    let IpcResponse::Serve(info) = resp else {
        anyhow::bail!("unexpected response");
    };
    if out.json {
        return out.print_json(&info);
    }
    out.writeln(format!(
        "{} Serve active at {}",
        out.green("✓"),
        out.cyan(&info.url)
    ));
    Ok(())
}

async fn run_serve_status(json: bool, state_dir: Option<&str>) -> anyhow::Result<()> {
    let out = Output::new(json);
    let ipc = client(state_dir).await?;
    let resp = ipc.request(IpcRequest::ServeStatus).await?;
    let IpcResponse::Serves { serves } = resp else {
        anyhow::bail!("unexpected response");
    };
    if out.json {
        return out.print_json(&serves);
    }
    if serves.is_empty() {
        out.writeln(out.dim("No active serves."));
        return Ok(());
    }
    for s in serves {
        out.writeln(format!(
            "{}  {}  {}  {}",
            out.online_dot(s.status == "active"),
            out.cyan(&s.url),
            s.protocol,
            out.dim(&s.status)
        ));
    }
    Ok(())
}

async fn run_serve_off(port: u16, json: bool, state_dir: Option<&str>) -> anyhow::Result<()> {
    let out = Output::new(json);
    let ipc = client(state_dir).await?;
    let resp = ipc.request(IpcRequest::ServeOff { port }).await?;
    let IpcResponse::Serve(info) = resp else {
        anyhow::bail!("unexpected response");
    };
    if out.json {
        return out.print_json(&info);
    }
    out.writeln(format!("{} Stopped serve on port {port}", out.green("✓")));
    let _ = info;
    Ok(())
}

// ---------- tunnel ----------

#[derive(clap::Args, Debug)]
pub struct TunnelArgs {
    #[command(subcommand)]
    pub command: Option<TunnelSubcommand>,
    /// Local port to expose publicly (when starting without a subcommand)
    pub port: Option<u16>,
    #[arg(long, default_value = "https")]
    pub protocol: String,
    /// Relay id, name, or omit for auto
    #[arg(long)]
    pub relay: Option<String>,
    #[arg(long)]
    pub subdomain: Option<String>,
    #[arg(long)]
    pub json: bool,
    #[arg(long, env = "TUNTUN_STATE_DIR")]
    pub state_dir: Option<String>,
}

#[derive(clap::Subcommand, Debug)]
pub enum TunnelSubcommand {
    /// List active tunnels
    Status {
        #[arg(long)]
        json: bool,
        #[arg(long, env = "TUNTUN_STATE_DIR")]
        state_dir: Option<String>,
    },
    /// Stop a public tunnel
    Off {
        port: u16,
        #[arg(long)]
        json: bool,
        #[arg(long, env = "TUNTUN_STATE_DIR")]
        state_dir: Option<String>,
    },
}

pub async fn run_tunnel(args: TunnelArgs) -> anyhow::Result<()> {
    match args.command {
        Some(TunnelSubcommand::Status { json, state_dir }) => {
            run_tunnel_status(json, state_dir.as_deref()).await
        }
        Some(TunnelSubcommand::Off {
            port,
            json,
            state_dir,
        }) => run_tunnel_off(port, json, state_dir.as_deref()).await,
        None => {
            let port = args.port.context(
                "usage: tuntun tunnel <port> | tuntun tunnel status | tuntun tunnel off <port>",
            )?;
            run_tunnel_start(
                port,
                &args.protocol,
                args.relay.as_deref(),
                args.subdomain.as_deref(),
                args.json,
                args.state_dir.as_deref(),
            )
            .await
        }
    }
}

async fn run_tunnel_start(
    port: u16,
    protocol: &str,
    relay: Option<&str>,
    subdomain: Option<&str>,
    json: bool,
    state_dir: Option<&str>,
) -> anyhow::Result<()> {
    let out = Output::new(json);
    let ipc = client(state_dir).await?;
    let resp = ipc
        .request(IpcRequest::TunnelStart {
            port,
            protocol: protocol.to_string(),
            relay: relay.map(str::to_string),
            subdomain: subdomain.map(str::to_string),
        })
        .await?;
    let IpcResponse::Tunnel(info) = resp else {
        anyhow::bail!("unexpected response");
    };
    if out.json {
        return out.print_json(&info);
    }
    out.writeln(format!(
        "{} Tunnel active at {}",
        out.green("✓"),
        out.cyan(&info.public_url)
    ));
    Ok(())
}

async fn run_tunnel_status(json: bool, state_dir: Option<&str>) -> anyhow::Result<()> {
    let out = Output::new(json);
    let ipc = client(state_dir).await?;
    let resp = ipc.request(IpcRequest::TunnelStatus).await?;
    let IpcResponse::Tunnels { tunnels } = resp else {
        anyhow::bail!("unexpected response");
    };
    if out.json {
        return out.print_json(&tunnels);
    }
    if tunnels.is_empty() {
        out.writeln(out.dim("No active tunnels."));
        return Ok(());
    }
    for t in tunnels {
        out.writeln(format!(
            "{}  {}  :{}  {}  {}",
            out.online_dot(t.status == "active"),
            out.cyan(&t.public_url),
            t.port,
            t.protocol,
            out.dim(&t.status)
        ));
    }
    Ok(())
}

async fn run_tunnel_off(port: u16, json: bool, state_dir: Option<&str>) -> anyhow::Result<()> {
    let out = Output::new(json);
    let ipc = client(state_dir).await?;
    let resp = ipc.request(IpcRequest::TunnelOff { port }).await?;
    let IpcResponse::Tunnel(info) = resp else {
        anyhow::bail!("unexpected response");
    };
    if out.json {
        return out.print_json(&info);
    }
    out.writeln(format!("{} Stopped tunnel on port {port}", out.green("✓")));
    let _ = info;
    Ok(())
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        s.to_string()
    } else {
        let t: String = s.chars().take(max.saturating_sub(1)).collect();
        format!("{t}…")
    }
}

/// Shared helper kept for future serve/tunnel CLI modules.
#[allow(dead_code)]
pub async fn ensure_agent(state_dir: Option<&str>) -> anyhow::Result<IpcClient> {
    client(state_dir).await.context("agent IPC unavailable")
}
