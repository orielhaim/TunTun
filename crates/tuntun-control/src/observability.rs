use crate::config::Args;
use tracing_subscriber::{EnvFilter, prelude::*};

pub fn init(args: &Args) -> anyhow::Result<()> {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("tuntun_control=info,tower_http=info,sqlx=warn"));

    let fmt_layer = tracing_subscriber::fmt::layer().with_target(true);

    let registry = tracing_subscriber::registry().with(filter);

    if args.json_logs {
        registry.with(fmt_layer.json()).init();
    } else {
        registry.with(fmt_layer).init();
    }

    // OTLP is optional; if the endpoint isn't reachable we don't want to crash.
    if let Some(_endpoint) = args.otlp_endpoint.as_ref() {
        tracing::info!(
            "OTLP endpoint configured (tracing-opentelemetry wire-up left to deployment)"
        );
    }
    Ok(())
}
