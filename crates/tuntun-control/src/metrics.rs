use prometheus::{Encoder, IntCounterVec, IntGauge, Registry, TextEncoder, opts};

#[derive(Clone)]
pub struct Metrics {
    pub registry: Registry,
    pub http_requests: IntCounterVec,
    pub auth_failures: IntCounterVec,
    pub devices_online: IntGauge,
    pub ws_connected: IntGauge,
}

impl Metrics {
    pub fn new() -> anyhow::Result<Self> {
        let registry = Registry::new();
        let http_requests = IntCounterVec::new(
            opts!("tuntun_http_requests_total", "HTTP requests processed"),
            &["endpoint", "status"],
        )?;
        let auth_failures = IntCounterVec::new(
            opts!("tuntun_auth_failures_total", "Failed auth attempts"),
            &["reason"],
        )?;
        let devices_online = IntGauge::new("tuntun_devices_online", "Devices with live WS")?;
        let ws_connected = IntGauge::new("tuntun_ws_connected", "Currently open WS sessions")?;

        registry.register(Box::new(http_requests.clone()))?;
        registry.register(Box::new(auth_failures.clone()))?;
        registry.register(Box::new(devices_online.clone()))?;
        registry.register(Box::new(ws_connected.clone()))?;

        Ok(Self {
            registry,
            http_requests,
            auth_failures,
            devices_online,
            ws_connected,
        })
    }

    pub fn render(&self) -> String {
        let mut buf = Vec::new();
        let encoder = TextEncoder::new();
        let mf = self.registry.gather();
        let _ = encoder.encode(&mf, &mut buf);
        String::from_utf8(buf).unwrap_or_default()
    }
}
