use std::time::Duration;

use metrics::{counter, describe_counter, describe_gauge, gauge};
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};

#[derive(Clone)]
pub struct Metrics {
    handle: PrometheusHandle,
}

impl Metrics {
    pub fn new() -> anyhow::Result<Self> {
        let handle = PrometheusBuilder::new().install_recorder()?;

        describe_counter!("tuntun_http_requests_total", "HTTP requests processed");
        describe_counter!("tuntun_auth_failures_total", "Failed auth attempts");
        describe_gauge!("tuntun_devices_online", "Devices with live WS");
        describe_gauge!("tuntun_ws_connected", "Currently open WS sessions");

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

    pub fn http_request(&self, endpoint: &'static str, status: impl AsRef<str>) {
        counter!(
            "tuntun_http_requests_total",
            "endpoint" => endpoint,
            "status" => status.as_ref().to_string()
        )
        .increment(1);
    }

    pub fn auth_failure(&self, reason: &'static str) {
        counter!("tuntun_auth_failures_total", "reason" => reason).increment(1);
    }

    pub fn ws_connected_inc(&self) {
        gauge!("tuntun_ws_connected").increment(1.0);
    }

    pub fn ws_connected_dec(&self) {
        gauge!("tuntun_ws_connected").decrement(1.0);
    }

    pub fn devices_online_set(&self, n: i64) {
        gauge!("tuntun_devices_online").set(n as f64);
    }

    pub fn render(&self) -> String {
        self.handle.render()
    }
}
