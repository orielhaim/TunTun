use crate::config::Args;
use opentelemetry::trace::TracerProvider as _;
use opentelemetry_otlp::WithExportConfig;
use opentelemetry_sdk::trace::SdkTracerProvider;
use tracing_subscriber::{EnvFilter, prelude::*};

pub fn init(args: &Args) -> anyhow::Result<()> {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("tunnet_control=info,tower_http=info,sqlx=warn"));

    let Some(endpoint) = args.otlp_endpoint.as_ref() else {
        init_fmt_only(args.json_logs, filter);
        return Ok(());
    };

    let exporter = opentelemetry_otlp::SpanExporter::builder()
        .with_tonic()
        .with_endpoint(endpoint.clone())
        .build()?;

    let provider = SdkTracerProvider::builder()
        .with_batch_exporter(exporter)
        .build();
    let tracer = provider.tracer("tunnet-control");
    opentelemetry::global::set_tracer_provider(provider);

    if args.json_logs {
        tracing_subscriber::registry()
            .with(filter)
            .with(tracing_subscriber::fmt::layer().json().with_target(true))
            .with(tracing_opentelemetry::layer().with_tracer(tracer))
            .init();
    } else {
        tracing_subscriber::registry()
            .with(filter)
            .with(tracing_subscriber::fmt::layer().with_target(true))
            .with(tracing_opentelemetry::layer().with_tracer(tracer))
            .init();
    }

    tracing::info!(%endpoint, "OTLP tracing enabled");
    Ok(())
}

fn init_fmt_only(json_logs: bool, filter: EnvFilter) {
    if json_logs {
        tracing_subscriber::registry()
            .with(filter)
            .with(tracing_subscriber::fmt::layer().json().with_target(true))
            .init();
    } else {
        tracing_subscriber::registry()
            .with(filter)
            .with(tracing_subscriber::fmt::layer().with_target(true))
            .init();
    }
}
