use std::time::Duration;

use metrics::{counter, describe_counter, describe_gauge, gauge};
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};

#[derive(Clone)]
pub struct AgentMetrics {
    handle: PrometheusHandle,
}

impl AgentMetrics {
    pub fn new() -> anyhow::Result<Self> {
        let handle = PrometheusBuilder::new().install_recorder()?;

        describe_counter!("tuntun_packets_total", "Packets processed by the tunnel");
        describe_counter!("tuntun_bytes_total", "Bytes processed by the tunnel");
        describe_counter!("tuntun_dropped_packets_total", "Packets dropped");
        describe_gauge!("tuntun_active_connections", "Live peer connections");

        let upkeep = handle.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(5));
            loop {
                interval.tick().await;
                upkeep.run_upkeep();
            }
        });

        Ok(Self { handle })
    }

    pub fn packets_inc(&self, direction: &'static str) {
        counter!("tuntun_packets_total", "direction" => direction).increment(1);
    }

    pub fn bytes_add(&self, direction: &'static str, n: u64) {
        counter!("tuntun_bytes_total", "direction" => direction).increment(n);
    }

    pub fn dropped_inc(&self, reason: &'static str) {
        counter!("tuntun_dropped_packets_total", "reason" => reason).increment(1);
    }

    pub fn active_conns_inc(&self) {
        gauge!("tuntun_active_connections").increment(1.0);
    }

    pub fn active_conns_dec(&self) {
        gauge!("tuntun_active_connections").decrement(1.0);
    }

    pub fn render(&self) -> String {
        self.handle.render()
    }
}

pub fn metrics_port(bind: &str) -> &str {
    bind.rsplit(':').next().unwrap_or("9100")
}

/// Listen on localhost and the assigned overlay IP so peers can scrape via VPN.
pub fn spawn_listeners(metrics: AgentMetrics, metrics_bind: &str, overlay_ip: std::net::Ipv4Addr) {
    let port = metrics_port(metrics_bind);
    for bind in [
        format!("127.0.0.1:{}", port),
        format!("{}:{}", overlay_ip, port),
    ] {
        let m = metrics.clone();
        tokio::spawn(async move { serve_metrics(m, bind).await });
    }
}

pub async fn serve_metrics(metrics: AgentMetrics, bind: String) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = match tokio::net::TcpListener::bind(&bind).await {
        Ok(l) => l,
        Err(e) => {
            tracing::warn!(?e, "failed to bind metrics endpoint");
            return;
        }
    };
    tracing::info!(%bind, "metrics endpoint listening");
    loop {
        let Ok((mut sock, _)) = listener.accept().await else {
            continue;
        };
        let m = metrics.clone();
        tokio::spawn(async move {
            let mut buf = [0u8; 1024];
            let _ = sock.read(&mut buf).await; // best-effort: read the request line
            let body = m.render();
            let resp = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: text/plain; version=0.0.4\r\ncontent-length: {}\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = sock.write_all(resp.as_bytes()).await;
        });
    }
}
