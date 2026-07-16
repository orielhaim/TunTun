//! Heartbeat + registration against the Tunnet control / management plane.

use std::sync::Arc;
use std::time::Duration;

use anyhow::Context;
use serde::{Deserialize, Serialize};
use tunnet_common::{PortMapping, RedirectRule};

use crate::agent_accept::{AuthStore, TunnelAuth};
use crate::tcp::TcpMappingManager;

#[derive(Clone)]
pub struct ControlClient {
    base: String,
    http: reqwest::Client,
    token: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RegisterBody {
    endpoint_id: String,
    public_ip: Option<String>,
    agent_version: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterResponse {
    pub relay_id: String,
    pub name: String,
    pub domain: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HeartbeatBody {
    endpoint_id: String,
    active_tunnels: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    cert_valid_until: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HeartbeatTunnelAuth {
    #[serde(default)]
    tunnel_id: String,
    subdomain: String,
    auth_token: String,
    #[serde(default)]
    local_port: u16,
    #[serde(default = "default_https")]
    protocol: String,
    #[serde(default)]
    basic_auth_user: Option<String>,
    #[serde(default)]
    basic_auth_password_hash: Option<String>,
    #[serde(default)]
    redirect_rules: Vec<RedirectRule>,
    #[serde(default)]
    port_mappings: Vec<PortMapping>,
}

fn default_https() -> String {
    "https".into()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HeartbeatResponse {
    #[serde(default)]
    #[allow(dead_code)]
    ok: bool,
    #[serde(default)]
    tunnels: Vec<HeartbeatTunnelAuth>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrafficLogLine {
    tunnel_id: String,
    method: String,
    path: String,
    status_code: i32,
    latency_ms: i32,
    source_ip: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrafficIngestBody {
    logs: Vec<TrafficLogLine>,
}

impl ControlClient {
    pub fn new(base: String, token: String) -> anyhow::Result<Self> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()?;
        Ok(Self {
            base: base.trim_end_matches('/').to_string(),
            http,
            token,
        })
    }

    pub async fn register(
        &self,
        endpoint_id: &str,
        public_ip: Option<String>,
    ) -> anyhow::Result<RegisterResponse> {
        let url = format!("{}/v1/relay/register", self.base);
        let resp = self
            .http
            .post(&url)
            .header("authorization", format!("Bearer {}", self.token))
            .json(&RegisterBody {
                endpoint_id: endpoint_id.to_string(),
                public_ip,
                agent_version: env!("CARGO_PKG_VERSION").to_string(),
            })
            .send()
            .await
            .with_context(|| format!("POST {url}"))?;
        let status = resp.status();
        let text = resp.text().await?;
        if !status.is_success() {
            anyhow::bail!("relay register failed: {status}: {text}");
        }
        Ok(serde_json::from_str(&text)?)
    }

    pub async fn heartbeat(
        &self,
        endpoint_id: &str,
        active_tunnels: u32,
        cert_valid_until: Option<&str>,
    ) -> anyhow::Result<HeartbeatResponse> {
        let url = format!("{}/v1/relay/heartbeat", self.base);
        let resp = self
            .http
            .post(&url)
            .header("authorization", format!("Bearer {}", self.token))
            .json(&HeartbeatBody {
                endpoint_id: endpoint_id.to_string(),
                active_tunnels,
                cert_valid_until: cert_valid_until.map(str::to_string),
            })
            .send()
            .await
            .with_context(|| format!("POST {url}"))?;
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            anyhow::bail!("relay heartbeat failed: {status}: {text}");
        }
        match serde_json::from_str(&text) {
            Ok(v) => Ok(v),
            Err(_) => Ok(HeartbeatResponse {
                ok: true,
                tunnels: vec![],
            }),
        }
    }

    pub fn spawn_traffic_log(
        &self,
        tunnel_id: String,
        method: String,
        path: String,
        status_code: i32,
        latency_ms: i32,
        source_ip: Option<String>,
    ) {
        let client = self.clone();
        tokio::spawn(async move {
            if let Err(e) = client
                .post_traffic(vec![TrafficLogLine {
                    tunnel_id,
                    method,
                    path,
                    status_code,
                    latency_ms,
                    source_ip,
                    created_at: Some(chrono::Utc::now().to_rfc3339()),
                }])
                .await
            {
                tracing::debug!(?e, "traffic log post failed");
            }
        });
    }

    async fn post_traffic(&self, logs: Vec<TrafficLogLine>) -> anyhow::Result<()> {
        if logs.is_empty() {
            return Ok(());
        }
        let url = format!("{}/v1/relay/traffic", self.base);
        let resp = self
            .http
            .post(&url)
            .header("authorization", format!("Bearer {}", self.token))
            .json(&TrafficIngestBody { logs })
            .send()
            .await
            .with_context(|| format!("POST {url}"))?;
        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("traffic ingest failed: {status}: {text}");
        }
        Ok(())
    }
}

pub fn spawn_heartbeat_loop(
    client: ControlClient,
    endpoint_id: String,
    registry: crate::registry::TunnelRegistry,
    auth: AuthStore,
    tcp_mgr: TcpMappingManager,
    cert_valid_until: Option<String>,
) {
    let client = Arc::new(client);
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(30));
        loop {
            ticker.tick().await;
            let n = registry.active_count() as u32;
            match client
                .heartbeat(&endpoint_id, n, cert_valid_until.as_deref())
                .await
            {
                Ok(resp) => {
                    let mut keep = Vec::with_capacity(resp.tunnels.len());
                    let mut mappings: Vec<(String, String, PortMapping)> = Vec::new();
                    for t in resp.tunnels {
                        keep.push(t.subdomain.clone());
                        let mut maps = t.port_mappings.clone();
                        // Plain TCP tunnels without explicit mappings bind localPort.
                        if t.protocol == "tcp" && maps.is_empty() && t.local_port > 0 {
                            maps.push(PortMapping {
                                external_port: t.local_port,
                                target_port: t.local_port,
                                target_ipv4: None,
                            });
                        }
                        for m in &maps {
                            mappings.push((t.subdomain.clone(), t.tunnel_id.clone(), m.clone()));
                        }
                        auth.insert(
                            &t.subdomain,
                            TunnelAuth {
                                tunnel_id: t.tunnel_id,
                                auth_token: t.auth_token,
                                local_port: t.local_port,
                                protocol: t.protocol,
                                basic_auth_user: t.basic_auth_user,
                                basic_auth_password_hash: t.basic_auth_password_hash,
                                redirect_rules: t.redirect_rules,
                                port_mappings: maps,
                            },
                        );
                    }
                    auth.retain_subdomains(&keep);
                    tcp_mgr.reconcile(mappings, registry.clone());
                }
                Err(e) => {
                    tracing::warn!(?e, "relay heartbeat failed");
                }
            }
        }
    });
}
