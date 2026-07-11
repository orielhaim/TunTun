use anyhow::Context;
use clap::{Args, Parser, Subcommand};
use tuntun_core::{AgentIdentity, PersistedState, StatePaths};

#[derive(Parser, Debug)]
#[command(name = "tuntun", about = "TunTun — mesh networking, serve, and tunnel")]
pub struct Cli {
    #[arg(long, env = "TUNTUN_STATE_DIR", global = true)]
    pub state_dir: Option<String>,
    #[arg(long, env = "TUNTUN_JSON_LOGS", global = true)]
    pub json_logs: bool,
    #[command(subcommand)]
    pub command: Command,
}

#[derive(Subcommand, Debug)]
pub enum Command {
    /// Enroll this machine into a TunTun network
    Enroll(EnrollArgs),
    /// Run the TunTun agent (requires root / admin for TUN)
    Run(RunArgs),
    /// Wipe local agent state
    Reset(ResetArgs),

    /// Show agent / network status
    Status(crate::cmds::StatusArgs),
    /// Measure mesh RTT to a peer (QUIC, not ICMP)
    Ping(crate::cmds::PingArgs),
    /// PeerDNS status
    #[command(subcommand)]
    Dns(DnsCommand),
    /// Subnet / hostname / exit routes
    #[command(subcommand)]
    Route(RouteCommand),
    /// Full connectivity diagnostics
    Diag(crate::cmds::DiagArgs),
    /// Quick pass/fail connectivity check
    Netcheck(crate::cmds::NetcheckArgs),
    /// Expose a local port to the mesh (HTTPS/TCP)
    ///
    /// Examples: `tuntun serve 3000`, `tuntun serve status`, `tuntun serve off 3000`
    Serve(crate::cmds::ServeArgs),
    /// Expose a local port to the public internet via a relay
    ///
    /// Examples: `tuntun tunnel 3000`, `tuntun tunnel status`, `tuntun tunnel off 3000`
    Tunnel(crate::cmds::TunnelArgs),
}

#[derive(Subcommand, Debug)]
pub enum DnsCommand {
    /// Show PeerDNS configuration and cache
    Status(crate::cmds::DnsStatusArgs),
}

#[derive(Subcommand, Debug)]
pub enum RouteCommand {
    /// List active routes
    List(crate::cmds::RouteListArgs),
    /// Advertise a subnet route from this machine
    Add(crate::cmds::RouteAddArgs),
}

#[derive(Args, Debug)]
pub struct EnrollArgs {
    #[arg(long, env = "TUNTUN_CONTROL_URL")]
    pub control_url: String,
    #[arg(long, env = "TUNTUN_ENROLL_TOKEN")]
    pub token: String,
    #[arg(long, env = "TUNTUN_HOSTNAME")]
    pub hostname: Option<String>,
}

#[derive(Args, Debug)]
pub struct RunArgs {
    #[arg(long, env = "TUNTUN_IFNAME", default_value = "tuntun0")]
    pub ifname: String,
    #[arg(long, env = "TUNTUN_POLL_SECS", default_value_t = 30)]
    pub poll_secs: u64,
    #[arg(long, env = "TUNTUN_METRICS_BIND", default_value = "127.0.0.1:9100")]
    pub metrics_bind: String,
    #[arg(long, env = "TUNTUN_DISABLE_GOSSIP")]
    pub disable_gossip: bool,
    #[cfg(windows)]
    #[arg(long, env = "TUNTUN_WINTUN_FILE")]
    pub wintun_file: Option<String>,
}

#[derive(Args, Debug)]
pub struct ResetArgs {
    #[arg(long)]
    pub yes: bool,
}

pub fn init_logging(cli: &Cli) {
    let filter = tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
        tracing_subscriber::EnvFilter::new("info,tuntun_agent=debug,tuntun_core=debug")
    });
    let sub = tracing_subscriber::fmt().with_env_filter(filter);
    if cli.json_logs {
        sub.json().init();
    } else {
        sub.init();
    }
}

fn paths(cli_state_dir: Option<&str>) -> StatePaths {
    StatePaths::resolve(cli_state_dir)
}

pub async fn run_enroll(args: EnrollArgs, state_dir: Option<&str>) -> anyhow::Result<()> {
    let paths = paths(state_dir);
    paths.ensure()?;

    let hostname = args
        .hostname
        .or_else(|| std::env::var("HOSTNAME").ok())
        .or_else(|| std::env::var("COMPUTERNAME").ok())
        .unwrap_or_else(|| "tuntun-node".into());

    let identity = AgentIdentity::generate();
    tracing::info!(endpoint_id = %identity.endpoint_id_hex(), "generated new agent identity");

    let client = tuntun_core::UnauthedClient::new(args.control_url.clone())?;
    let metadata =
        crate::system_info::collect_system_metadata(&hostname, env!("CARGO_PKG_VERSION"));

    let resp = client
        .enroll(tuntun_common::EnrollRequest {
            enrollment_token: args.token,
            endpoint_id: identity.endpoint_id_hex(),
            hostname: hostname.clone(),
            os: std::env::consts::OS.to_string(),
            agent_version: env!("CARGO_PKG_VERSION").to_string(),
            metadata: Some(metadata),
        })
        .await
        .context("enroll with control plane")?;

    let membership = resp
        .snapshot
        .memberships
        .iter()
        .find(|m| m.network_id == resp.network_id)
        .context("enrolled network missing from snapshot")?;

    tracing::info!(
        assigned_ip = %membership.assigned_ipv4,
        network = %resp.network_name,
        peers = membership.ipv4_peers.len(),
        "enrollment successful"
    );

    let persisted = PersistedState {
        control_url: args.control_url,
        network_name: resp.network_name.clone(),
        network_id: resp.network_id,
        organization_id: resp.organization_id,
        enrolled_at: chrono::Utc::now(),
    };
    identity.save_to(&paths.key_file())?;
    persisted.save(&paths)?;
    tuntun_core::state::save_snapshot_cache(&paths, &resp.snapshot)?;

    println!(
        "Enrolled. endpoint_id={} ip={} network={}",
        identity.endpoint_id_hex(),
        membership.assigned_ipv4,
        resp.network_name,
    );
    Ok(())
}

pub async fn run_reset(args: ResetArgs, state_dir: Option<&str>) -> anyhow::Result<()> {
    let paths = paths(state_dir);
    if !args.yes {
        eprintln!("Re-run with --yes to actually wipe {}", paths.dir.display());
        return Ok(());
    }
    if paths.dir.exists() {
        std::fs::remove_dir_all(&paths.dir)?;
        println!("Wiped {}", paths.dir.display());
    } else {
        println!("Nothing to wipe.");
    }
    Ok(())
}

pub async fn run_agent(args: RunArgs, state_dir: Option<&str>) -> anyhow::Result<()> {
    let paths = paths(state_dir);
    let identity = AgentIdentity::load_from(&paths.key_file()).with_context(|| {
        format!(
            "no persisted identity in {}; run `tuntun enroll` first",
            paths.dir.display()
        )
    })?;
    let persisted = PersistedState::load(&paths)?;
    tracing::info!(
        endpoint_id = %identity.endpoint_id_hex(),
        network = %persisted.network_name,
        control = %persisted.control_url,
        "starting agent",
    );
    crate::runtime::run(identity, persisted, paths, args).await
}
