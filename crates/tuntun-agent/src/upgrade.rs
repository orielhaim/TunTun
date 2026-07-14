//! Graceful process upgrade via `ecdysis` (Unix only).
//!
//! SIGHUP (or `systemctl reload`) forks+execs the new binary. Existing work
//! drains in the parent after the child signals ready.

use anyhow::{Context, Result};
use ecdysis::tokio_ecdysis::{SignalKind, TokioEcdysis, TokioEcdysisBuilder};
use std::sync::Arc;

pub struct UpgradeGuard {
    /// Kept alive for the duration of the process; dropping it early breaks upgrades.
    _ecdysis: Arc<TokioEcdysis>,
    shutdown: std::pin::Pin<
        Box<
            dyn std::future::Future<Output = ecdysis::tokio_ecdysis::TokioEcdysisUpgradeResult>
                + Send,
        >,
    >,
}

impl UpgradeGuard {
    pub fn install() -> Result<Self> {
        let mut builder =
            TokioEcdysisBuilder::new(SignalKind::hangup()).context("ecdysis: register SIGHUP")?;
        builder
            .stop_on_signal(SignalKind::terminate())
            .context("ecdysis: register SIGTERM")?;
        builder
            .stop_on_signal(SignalKind::interrupt())
            .context("ecdysis: register SIGINT")?;

        if std::env::var_os("NOTIFY_SOCKET").is_some() {
            builder.enable_systemd_notifications().context(
                "ecdysis: enable systemd-notify (requires systemd >= 253 and Type=notify-reload)",
            )?;
            tracing::info!("systemd-notify enabled (Type=notify-reload)");
        }

        let (ecdysis, shutdown) = builder.ready().context("ecdysis: ready")?;
        if ecdysis.is_child() {
            tracing::info!("started as graceful-upgrade child");
        }

        Ok(Self {
            _ecdysis: ecdysis,
            shutdown: Box::pin(shutdown),
        })
    }

    pub async fn wait(self) -> ecdysis::tokio_ecdysis::TokioEcdysisUpgradeResult {
        self.shutdown.await
    }
}
