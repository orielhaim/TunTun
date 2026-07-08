mod cli;
mod gossip_presence;
mod ip;
mod metrics;
#[cfg(target_os = "linux")]
mod offload;
mod runtime;
mod system_info;
mod tun_io;
#[cfg(windows)]
mod wintun_path;

use crate::cli::Cli;
use clap::Parser;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();
    let cli = Cli::parse();
    crate::cli::init_logging(&cli);
    match cli.command {
        crate::cli::Command::Enroll(a) => crate::cli::run_enroll(a).await,
        crate::cli::Command::Run(a) => crate::cli::run_agent(a).await,
        crate::cli::Command::Reset(a) => crate::cli::run_reset(a).await,
    }
}
