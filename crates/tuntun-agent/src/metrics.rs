use prometheus::{Encoder, IntCounterVec, IntGauge, Registry, TextEncoder, opts};

#[derive(Clone)]
pub struct AgentMetrics {
    pub registry: Registry,
    pub packets: IntCounterVec,
    pub bytes: IntCounterVec,
    pub dropped: IntCounterVec,
    pub active_conns: IntGauge,
}

impl AgentMetrics {
    pub fn new() -> anyhow::Result<Self> {
        let registry = Registry::new();
        let packets = IntCounterVec::new(
            opts!("tuntun_packets_total", "Packets processed by the tunnel"),
            &["direction"],
        )?;
        let bytes = IntCounterVec::new(
            opts!("tuntun_bytes_total", "Bytes processed by the tunnel"),
            &["direction"],
        )?;
        let dropped = IntCounterVec::new(
            opts!("tuntun_dropped_packets_total", "Packets dropped"),
            &["reason"],
        )?;
        let active_conns = IntGauge::new("tuntun_active_connections", "Live peer connections")?;
        registry.register(Box::new(packets.clone()))?;
        registry.register(Box::new(bytes.clone()))?;
        registry.register(Box::new(dropped.clone()))?;
        registry.register(Box::new(active_conns.clone()))?;
        Ok(Self {
            registry,
            packets,
            bytes,
            dropped,
            active_conns,
        })
    }

    pub fn render(&self) -> String {
        let mut buf = Vec::new();
        let mf = self.registry.gather();
        let _ = TextEncoder::new().encode(&mf, &mut buf);
        String::from_utf8(buf).unwrap_or_default()
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
