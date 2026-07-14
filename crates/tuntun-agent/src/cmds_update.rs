//! `tuntun update` — download a newer release from GitHub and replace this binary.
//!
//! On Linux/macOS the default is a graceful reload (SIGHUP / `systemctl reload`),
//! which triggers ecdysis in the running agent. Pass `--restart` for a hard restart.

use anyhow::{Context, Result};
use clap::Args;
use self_update::cargo_crate_version;

const REPO_OWNER: &str = "orielhaim";
const REPO_NAME: &str = "TunTun";
const BIN_NAME: &str = "tuntun";

#[derive(Args, Debug)]
pub struct UpdateArgs {
    /// Only check whether an update is available
    #[arg(long)]
    pub check: bool,
    /// Force download even when already on the latest version
    #[arg(long)]
    pub force: bool,
    /// Hard-restart the service after replacing the binary (default on Windows;
    /// on Linux/macOS the default is a graceful reload)
    #[arg(long)]
    pub restart: bool,
    /// Install a specific release tag (e.g. v0.3.1)
    #[arg(long)]
    pub version: Option<String>,
}

pub async fn run(args: UpdateArgs) -> Result<()> {
    tokio::task::spawn_blocking(move || run_blocking(args))
        .await
        .context("update task joined")?
}

fn run_blocking(args: UpdateArgs) -> Result<()> {
    let current = cargo_crate_version!();
    let target = self_update::get_target();

    let mut builder = self_update::backends::github::Update::configure();
    builder
        .repo_owner(REPO_OWNER)
        .repo_name(REPO_NAME)
        .bin_name(BIN_NAME)
        .bin_path_in_archive(format!("tuntun-{{{{ version }}}}-{target}/{{{{ bin }}}}"))
        .current_version(current)
        .no_confirm(true)
        .show_download_progress(true)
        .show_output(true);

    if let Some(tag) = args.version.as_deref() {
        let tag = if tag.starts_with('v') {
            tag.to_string()
        } else {
            format!("v{tag}")
        };
        builder.release_tag(tag);
    }

    let updater = builder.build().context("configure GitHub updater")?;

    if args.check {
        match updater.is_update_available().context("check for update")? {
            Some(release) => {
                println!("Update available: v{current} → v{}", release.version());
            }
            None => {
                println!("Up to date (v{current})");
            }
        }
        return Ok(());
    }

    match updater.is_update_available().context("check for update")? {
        Some(release) => {
            println!("Updating TunTun: v{current} → v{}", release.version());
        }
        None if !args.force && args.version.is_none() => {
            println!("Already up to date (v{current})");
            return Ok(());
        }
        None => {
            println!("Reinstalling current version (v{current})");
        }
    }

    let status = updater.update().context("download and install update")?;
    println!("Updated to v{}", status.version());

    apply_service_reload(args.restart)?;
    Ok(())
}

fn apply_service_reload(force_restart: bool) -> Result<()> {
    let probe = crate::service::probe();
    if !probe.installed {
        println!("Service not installed; binary updated in place.");
        println!("Restart a running agent manually if needed.");
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        if force_restart {
            println!("Restarting tuntun service…");
            crate::service::restart(None)?;
        } else if std::path::Path::new("/etc/systemd/system/tuntun.service").exists() {
            println!("Reloading tuntun service (graceful)…");
            if crate::service::is_root() {
                let _ = crate::service::refresh_unit(None);
            }
            let status = std::process::Command::new("systemctl")
                .args(["reload", "tuntun"])
                .status()
                .context("systemctl reload")?;
            if !status.success() {
                anyhow::bail!(
                    "systemctl reload failed ({status}); try `sudo tuntun service install && sudo tuntun update --restart`"
                );
            }
            println!("Reload signaled (SIGHUP). The agent will upgrade without a hard stop.");
        } else {
            println!("Service unit missing; start with: sudo tuntun service start");
        }
        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        let _ = force_restart;
        println!("Restarting tuntun service…");
        crate::service::restart(None)?;
        Ok(())
    }

    #[cfg(windows)]
    {
        let _ = force_restart;
        println!("Restarting tuntun service…");
        crate::service::restart(None)?;
        Ok(())
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        let _ = force_restart;
        println!("Restart the agent process to pick up the new binary.");
        Ok(())
    }
}
