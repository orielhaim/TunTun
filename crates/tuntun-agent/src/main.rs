mod cli;
mod control_client;
mod enforcement;
mod gossip_presence;
mod ip;
mod iroh_io;
mod metrics;
#[cfg(target_os = "linux")]
mod offload;
mod persistent;
mod routing;
mod runtime;
mod system_info;
mod tun_io;
#[cfg(windows)]
mod wintun_path;
mod ws_client;

use clap::Parser;

use crate::cli::Cli;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();

    let cli = Cli::parse();
    crate::cli::init_logging(&cli);

    match cli.command {
        crate::cli::Command::Enroll(args) => crate::cli::run_enroll(args).await,
        crate::cli::Command::Run(args) => crate::cli::run_agent(args).await,
        crate::cli::Command::Reset(args) => crate::cli::run_reset(args).await,
    }
}
