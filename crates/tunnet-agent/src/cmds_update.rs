//! `tunnet update` - download a newer release from GitHub and replace this binary.
//!
//! On Linux the default is a graceful reload (SIGHUP / `systemctl reload`),
//! which triggers ecdysis in the running agent. Pass `--restart` for a hard restart.

use std::path::Path;

use anyhow::{Context, Result};
use clap::Args;
use self_update::cargo_crate_version;

const REPO_OWNER: &str = "tunnetio";
const REPO_NAME: &str = "Tunnet";
const BIN_NAME: &str = "tunnet";

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

#[derive(Debug, Clone)]
pub enum UpdateOutcome {
    UpToDate {
        version: String,
    },
    Updated {
        from_version: String,
        to_version: String,
    },
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
        .bin_path_in_archive(format!("tunnet-{{{{ version }}}}-{target}/{{{{ bin }}}}"))
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
            println!("Updating Tunnet: v{current} → v{}", release.version());
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

/// Quiet update for the auto-update loop. Optionally backs up the current binary
/// to `previous_bin` before replacing it.
pub fn apply_update_quiet(previous_bin: Option<&Path>) -> Result<UpdateOutcome> {
    let current = cargo_crate_version!();
    let target = self_update::get_target();

    let mut builder = self_update::backends::github::Update::configure();
    builder
        .repo_owner(REPO_OWNER)
        .repo_name(REPO_NAME)
        .bin_name(BIN_NAME)
        .bin_path_in_archive(format!("tunnet-{{{{ version }}}}-{target}/{{{{ bin }}}}"))
        .current_version(current)
        .no_confirm(true)
        .show_download_progress(false)
        .show_output(false);

    let updater = builder.build().context("configure GitHub updater")?;

    let Some(_release) = updater.is_update_available().context("check for update")? else {
        return Ok(UpdateOutcome::UpToDate {
            version: current.to_string(),
        });
    };

    if let Some(dest) = previous_bin {
        let exe = std::env::current_exe().context("current_exe")?;
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(&exe, dest)
            .with_context(|| format!("backup {} → {}", exe.display(), dest.display()))?;
    }

    let status = updater.update().context("download and install update")?;
    Ok(UpdateOutcome::Updated {
        from_version: current.to_string(),
        to_version: status.version().to_string(),
    })
}

pub fn apply_service_reload(force_restart: bool) -> Result<()> {
    let probe = crate::service::probe();
    if !probe.installed {
        tracing::info!("service not installed; binary updated in place");
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        if force_restart {
            tracing::info!("restarting tunnet service");
            crate::service::restart(None)?;
        } else if std::path::Path::new("/etc/systemd/system/tunnet.service").exists() {
            tracing::info!("reloading tunnet service (graceful)");
            if crate::service::is_root() {
                let _ = crate::service::refresh_unit(None);
            }
            let status = std::process::Command::new("systemctl")
                .args(["reload", "tunnet"])
                .status()
                .context("systemctl reload")?;
            if !status.success() {
                anyhow::bail!("systemctl reload failed ({status})");
            }
        } else {
            tracing::warn!("service unit missing; start with: tunnet service start");
        }
        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        let _ = force_restart;
        tracing::info!("restarting tunnet service");
        crate::service::restart(None)?;
        Ok(())
    }

    #[cfg(windows)]
    {
        let _ = force_restart;
        tracing::info!("restarting tunnet service");
        crate::service::restart(None)?;
        Ok(())
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        let _ = force_restart;
        Ok(())
    }
}
