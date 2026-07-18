use std::net::SocketAddr;
use std::path::PathBuf;

use clap::{Parser, Subcommand};
use tracing_subscriber::EnvFilter;
use tunnet_operator::{
    DEFAULT_NAMESPACE, KUBE_NODE_IMAGE_ENV, RunConfig, build_client, controllers,
    crds::AuthSecretRef, health, leader, webhook,
};

#[derive(Parser, Debug)]
#[command(name = "tunnet-operator", about = "Tunnet Kubernetes operator")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    Run(Box<RunArgs>),
    PrintCrds,
}

#[derive(Parser, Debug)]
struct RunArgs {
    /// Namespace where the operator and workloads run.
    #[arg(long, env = "POD_NAMESPACE", default_value = DEFAULT_NAMESPACE)]
    namespace: String,

    /// Operator pod name (leader election identity).
    #[arg(long, env = "POD_NAME", default_value = "tunnet-operator")]
    pod_name: String,

    /// Image for tunnet-kube-node pods.
    #[arg(long, env = KUBE_NODE_IMAGE_ENV, default_value = "ghcr.io/tunnet/tunnet-kube-node:latest")]
    kube_node_image: String,

    /// Default auth secret name in the operator namespace.
    #[arg(long, env = "TUNNET_DEFAULT_AUTH_SECRET")]
    default_auth_secret: Option<String>,

    /// Node TTL passed to Management API enroll.
    #[arg(long, env = "TUNNET_NODE_EXPIRES_IN", default_value = "24h")]
    node_expires_in: String,

    #[arg(long, env = "TUNNET_HEALTH_ADDR", default_value = "0.0.0.0:8080")]
    health_addr: SocketAddr,

    #[arg(long, env = "TUNNET_WEBHOOK_ADDR", default_value = "0.0.0.0:9443")]
    webhook_addr: SocketAddr,

    /// PEM certificate for the mutating webhook TLS listener.
    #[arg(long, env = "TUNNET_WEBHOOK_CERT_FILE", default_value = "/tls/tls.crt")]
    webhook_cert_file: PathBuf,

    /// PEM private key for the mutating webhook TLS listener.
    #[arg(long, env = "TUNNET_WEBHOOK_KEY_FILE", default_value = "/tls/tls.key")]
    webhook_key_file: PathBuf,

    /// Kubernetes Service name used in the webhook certificate SANs.
    #[arg(
        long,
        env = "TUNNET_WEBHOOK_SERVICE",
        default_value = "tunnet-operator-webhook"
    )]
    webhook_service: String,

    #[arg(long, env = "TUNNET_METRICS", default_value_t = true)]
    metrics: bool,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // kube / axum-server may pull multiple rustls crypto backends; pin ring explicitly.
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("install rustls CryptoProvider");

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let cli = Cli::parse();
    match cli.command {
        Commands::Run(args) => run(*args).await,
        Commands::PrintCrds => {
            print!("{}", webhook::print_all_crds()?);
            Ok(())
        }
    }
}

async fn run(args: RunArgs) -> anyhow::Result<()> {
    let client = build_client().await?;
    leader::ensure_lease_namespace(client.clone(), &args.namespace).await?;

    let default_auth_secret = args.default_auth_secret.map(|name| AuthSecretRef {
        name,
        namespace: Some(args.namespace.clone()),
    });

    let config = RunConfig {
        namespace: args.namespace.clone(),
        pod_name: args.pod_name,
        kube_node_image: args.kube_node_image,
        node_expires_in: args.node_expires_in,
        default_auth_secret,
        health_addr: args.health_addr,
        webhook_addr: args.webhook_addr,
        metrics_enabled: args.metrics,
    };

    let ctx = config.into_context(client);

    if ctx.metrics_enabled {
        metrics_exporter_prometheus::PrometheusBuilder::new()
            .install_recorder()
            .ok();
    }

    let health_ctx = ctx.clone();
    tokio::spawn(async move {
        if let Err(e) = health::serve(health_ctx.health_addr).await {
            tracing::error!(error = %e, "health server failed");
        }
    });

    let webhook_ctx = ctx.clone();
    let webhook_addr = args.webhook_addr;
    let cert_file = args.webhook_cert_file.clone();
    let key_file = args.webhook_key_file.clone();
    let webhook_service = args.webhook_service.clone();
    let webhook_ns = args.namespace.clone();
    tokio::spawn(async move {
        let (cert_pem, key_pem) = match webhook::load_or_generate_tls(
            Some(&cert_file),
            Some(&key_file),
            &webhook_service,
            &webhook_ns,
        )
        .await
        {
            Ok(pair) => pair,
            Err(e) => {
                tracing::error!(error = %e, "webhook TLS setup failed");
                return;
            }
        };
        let app = webhook::router(webhook::WebhookState {
            ctx: webhook_ctx.clone(),
        });
        tracing::info!(addr = %webhook_addr, "webhook server listening (TLS)");
        if let Err(e) = webhook::serve_tls(webhook_addr, app, &cert_pem, &key_pem).await {
            tracing::error!(error = %e, "webhook server failed");
        }
    });

    leader::run_as_leader(ctx.clone(), |leader_ctx| async move {
        tracing::info!("starting Tunnet controllers");
        controllers::spawn_all(leader_ctx).await
    })
    .await
}
