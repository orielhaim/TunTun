use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tunnet_core::{StatePaths, TunnetConfig};

use crate::cmds_update::{UpdateOutcome, apply_service_reload, apply_update_quiet};

const DEFAULT_HEALTH_SECS: u64 = 30;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PendingUpdate {
    installed_at_unix: u64,
    from_version: String,
    to_version: String,
    health_window_secs: u64,
    boots: u32,
}

pub fn on_agent_start(paths: &StatePaths) -> Result<()> {
    let pending_path = paths.update_pending_file();
    if !pending_path.exists() {
        return Ok(());
    }

    let mut pending: PendingUpdate =
        serde_json::from_slice(&std::fs::read(&pending_path).context("read update pending")?)
            .context("parse update pending")?;

    let now = unix_now();
    let elapsed = now.saturating_sub(pending.installed_at_unix);
    let window = pending.health_window_secs.max(1);

    pending.boots = pending.boots.saturating_add(1);
    write_pending(paths, &pending)?;

    if pending.boots > 1 && elapsed < window {
        tracing::error!(
            boots = pending.boots,
            elapsed_secs = elapsed,
            window_secs = window,
            from = %pending.from_version,
            to = %pending.to_version,
            "new version unstable within health window; reverting"
        );
        revert_to_previous(paths, &pending)?;
        return Ok(());
    }

    if elapsed >= window {
        mark_update_success(paths, &pending)?;
        return Ok(());
    }

    let remaining = window - elapsed;
    let paths = paths.clone();
    let pending_clone = pending.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(remaining)).await;
        if let Err(e) = mark_update_success(&paths, &pending_clone) {
            tracing::warn!(?e, "failed to clear update pending after health window");
        } else {
            tracing::info!(
                to = %pending_clone.to_version,
                "auto-update healthy; previous binary discarded"
            );
        }
    });

    Ok(())
}

pub fn spawn(paths: StatePaths) {
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(60)).await;
        loop {
            let cfg = TunnetConfig::try_load(&paths)
                .ok()
                .flatten()
                .unwrap_or_default();
            let update = cfg.update;

            if update.enabled {
                let health = update.health_window_secs.max(1);
                if let Err(e) = check_once(&paths, health).await {
                    tracing::warn!(?e, "auto-update check failed");
                }
            }

            let sleep_secs = if update.enabled {
                update.check_interval_hours.max(1) * 3600
            } else {
                3600 // re-check whether it was enabled
            };
            tokio::time::sleep(Duration::from_secs(sleep_secs)).await;
        }
    });
}

async fn check_once(paths: &StatePaths, health_window_secs: u64) -> Result<()> {
    if paths.update_pending_file().exists() {
        tracing::debug!("auto-update: pending health window; skip check");
        return Ok(());
    }

    let prev = paths.update_previous_bin();
    let outcome = tokio::task::spawn_blocking(move || apply_update_quiet(Some(prev.as_path())))
        .await
        .context("auto-update join")??;

    match outcome {
        UpdateOutcome::UpToDate { version } => {
            tracing::debug!(%version, "auto-update: already current");
            Ok(())
        }
        UpdateOutcome::Updated {
            from_version,
            to_version,
        } => {
            tracing::info!(%from_version, %to_version, "auto-update: binary replaced");
            stage_pending(paths, &from_version, &to_version, health_window_secs)?;
            apply_service_reload(false)?;
            Ok(())
        }
    }
}

fn stage_pending(paths: &StatePaths, from: &str, to: &str, health_window_secs: u64) -> Result<()> {
    std::fs::create_dir_all(paths.update_dir())?;
    let pending = PendingUpdate {
        installed_at_unix: unix_now(),
        from_version: from.to_string(),
        to_version: to.to_string(),
        health_window_secs: if health_window_secs == 0 {
            DEFAULT_HEALTH_SECS
        } else {
            health_window_secs
        },
        boots: 0,
    };
    write_pending(paths, &pending)?;
    Ok(())
}

fn mark_update_success(paths: &StatePaths, pending: &PendingUpdate) -> Result<()> {
    let pending_path = paths.update_pending_file();
    if !pending_path.exists() {
        return Ok(());
    }
    if let Ok(bytes) = std::fs::read(&pending_path)
        && let Ok(current) = serde_json::from_slice::<PendingUpdate>(&bytes)
        && current.to_version != pending.to_version
    {
        return Ok(());
    }
    let _ = std::fs::remove_file(&pending_path);
    let prev = paths.update_previous_bin();
    if prev.exists() {
        let _ = std::fs::remove_file(&prev);
    }
    Ok(())
}

fn revert_to_previous(paths: &StatePaths, pending: &PendingUpdate) -> Result<()> {
    let prev = paths.update_previous_bin();
    if !prev.exists() {
        tracing::error!("cannot revert: previous binary missing");
        let _ = std::fs::remove_file(paths.update_pending_file());
        return Ok(());
    }

    let exe = std::env::current_exe().context("current_exe")?;
    let tmp = exe.with_extension("reverting");
    std::fs::copy(&prev, &tmp).context("copy previous binary to temp")?;
    replace_exe(&tmp, &exe)?;
    let _ = std::fs::remove_file(&prev);
    let _ = std::fs::remove_file(paths.update_pending_file());

    tracing::warn!(
        restored = %pending.from_version,
        rejected = %pending.to_version,
        "reverted auto-update; restarting service"
    );
    let _ = apply_service_reload(true);
    Ok(())
}

fn replace_exe(src: &Path, dest: &Path) -> Result<()> {
    #[cfg(windows)]
    {
        let bak = dest.with_extension("bad");
        let _ = std::fs::remove_file(&bak);
        if dest.exists() {
            std::fs::rename(dest, &bak).context("rename bad binary aside")?;
        }
        std::fs::rename(src, dest).or_else(|_| {
            std::fs::copy(src, dest)
                .map(|_| ())
                .context("copy restored binary")
        })?;
        let _ = std::fs::remove_file(&bak);
        let _ = std::fs::remove_file(src);
        Ok(())
    }
    #[cfg(not(windows))]
    {
        std::fs::rename(src, dest).or_else(|_| {
            std::fs::copy(src, dest)?;
            std::fs::remove_file(src)?;
            Ok(())
        })
    }
}

fn write_pending(paths: &StatePaths, pending: &PendingUpdate) -> Result<()> {
    std::fs::create_dir_all(paths.update_dir())?;
    let json = serde_json::to_vec_pretty(pending)?;
    std::fs::write(paths.update_pending_file(), json)?;
    Ok(())
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
