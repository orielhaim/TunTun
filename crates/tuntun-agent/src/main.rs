mod cli;
mod cmds;
mod forward;
mod gossip_presence;
mod ip;
mod metrics;
#[cfg(target_os = "linux")]
mod offload;
mod output;
mod runtime;
mod stream_proxy;
mod system_dns;
mod system_info;
mod system_routes;
mod tun_io;
#[cfg(windows)]
mod wintun_path;

use crate::cli::Cli;
use clap::Parser;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();
    let cli = Cli::parse();

    // Bootstrap commands need logging; query commands stay quiet unless tracing is set.
    let quiet = matches!(
        cli.command,
        crate::cli::Command::Status(_)
            | crate::cli::Command::Ping(_)
            | crate::cli::Command::Dns(_)
            | crate::cli::Command::Route(_)
            | crate::cli::Command::Diag(_)
            | crate::cli::Command::Netcheck(_)
            | crate::cli::Command::Serve(_)
            | crate::cli::Command::Tunnel(_)
    );
    if !quiet {
        crate::cli::init_logging(&cli);
    } else if std::env::var_os("RUST_LOG").is_some() {
        crate::cli::init_logging(&cli);
    }

    match cli.command {
        crate::cli::Command::Enroll(a) => crate::cli::run_enroll(a, cli.state_dir.as_deref()).await,
        crate::cli::Command::Run(a) => crate::cli::run_agent(a, cli.state_dir.as_deref()).await,
        crate::cli::Command::Reset(a) => crate::cli::run_reset(a, cli.state_dir.as_deref()).await,
        crate::cli::Command::Status(a) => crate::cmds::run_status(a).await,
        crate::cli::Command::Ping(a) => crate::cmds::run_ping(a).await,
        crate::cli::Command::Dns(crate::cli::DnsCommand::Status(a)) => {
            crate::cmds::run_dns_status(a).await
        }
        crate::cli::Command::Route(crate::cli::RouteCommand::List(a)) => {
            crate::cmds::run_route_list(a).await
        }
        crate::cli::Command::Route(crate::cli::RouteCommand::Add(a)) => {
            crate::cmds::run_route_add(a).await
        }
        crate::cli::Command::Diag(a) => crate::cmds::run_diag(a).await,
        crate::cli::Command::Netcheck(a) => crate::cmds::run_netcheck(a).await,
        crate::cli::Command::Serve(a) => crate::cmds::run_serve(a).await,
        crate::cli::Command::Tunnel(a) => crate::cmds::run_tunnel(a).await,
    }
}
