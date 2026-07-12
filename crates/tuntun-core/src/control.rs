use anyhow::Context;
use chrono::Utc;
use ed25519_dalek::SigningKey;
use reqwest::{Method, header::HeaderValue};
use tuntun_common::{
    EndpointSnapshot, EnrollRequest, EnrollResponse, HDR_ENDPOINT_ID, HDR_SIGNATURE, HDR_TIMESTAMP,
    PollRequest, RegisterRequest, signing,
};

pub struct UnauthedClient {
    base: String,
    http: reqwest::Client,
}

impl UnauthedClient {
    pub fn new(base: String) -> anyhow::Result<Self> {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()?;
        Ok(Self { base, http })
    }

    pub async fn enroll(&self, req: EnrollRequest) -> anyhow::Result<EnrollResponse> {
        let url = format!("{}/v1/enroll", self.base);
        let resp = self
            .http
            .post(&url)
            .json(&req)
            .send()
            .await
            .with_context(|| format!("POST {url}"))?;
        let status = resp.status();
        let body = resp.text().await?;
        if !status.is_success() {
            anyhow::bail!("enroll failed: {status}: {body}");
        }
        Ok(serde_json::from_str(&body)?)
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SdkRegisterApiResponse {
    organization_id: String,
    network_id: uuid::Uuid,
    network_name: String,
    #[allow(dead_code)]
    assigned_ip: String,
    #[allow(dead_code)]
    network_cidr: String,
    snapshot: EndpointSnapshot,
}

pub struct ManagementClient {
    base: String,
    http: reqwest::Client,
}

impl ManagementClient {
    pub fn new(base: String) -> anyhow::Result<Self> {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()?;
        Ok(Self { base, http })
    }

    pub async fn register_sdk_node(
        &self,
        api_key: &str,
        organization_id: &str,
        network_id: uuid::Uuid,
        endpoint_id: &str,
        hostname: &str,
        metadata: Option<serde_json::Value>,
    ) -> anyhow::Result<EnrollResponse> {
        let url = format!(
            "{}/api/v1/organizations/{organization_id}/networks/{network_id}/sdk-nodes",
            self.base.trim_end_matches('/')
        );
        let mut body = serde_json::json!({
            "endpointId": endpoint_id,
            "hostname": hostname,
        });
        if let Some(meta) = metadata
            && let Some(obj) = meta.as_object()
        {
            for (k, v) in obj {
                body[k] = v.clone();
            }
        }
        let resp = self
            .http
            .post(&url)
            .bearer_auth(api_key)
            .json(&body)
            .send()
            .await
            .with_context(|| format!("POST {url}"))?;
        let status = resp.status();
        let text = resp.text().await?;
        if !status.is_success() {
            anyhow::bail!("sdk register failed: {status}: {text}");
        }
        let parsed: SdkRegisterApiResponse = serde_json::from_str(&text)?;
        Ok(EnrollResponse {
            organization_id: parsed.organization_id,
            network_id: parsed.network_id,
            network_name: parsed.network_name,
            snapshot: parsed.snapshot,
        })
    }
}

pub struct SignedClient {
    pub base: String,
    pub http: reqwest::Client,
    pub endpoint_id: String,
    pub signing_key: SigningKey,
}

impl SignedClient {
    pub fn new(base: String, endpoint_id: String, signing_key: SigningKey) -> anyhow::Result<Self> {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()?;
        Ok(Self {
            base,
            http,
            endpoint_id,
            signing_key,
        })
    }

    fn sign(&self, method: &str, path: &str, body: &[u8]) -> (i64, String) {
        let ts = Utc::now().timestamp();
        let sig = signing::sign(&self.signing_key, method, path, ts, body);
        (ts, sig)
    }

    async fn do_post<T: serde::de::DeserializeOwned>(
        &self,
        path: &str,
        body: &(impl serde::Serialize + ?Sized),
    ) -> anyhow::Result<T> {
        let url = format!("{}{}", self.base, path);
        let json = serde_json::to_vec(body)?;
        let (ts, sig) = self.sign("POST", path, &json);
        let resp = self
            .http
            .request(Method::POST, &url)
            .header(HDR_ENDPOINT_ID, HeaderValue::from_str(&self.endpoint_id)?)
            .header(HDR_TIMESTAMP, HeaderValue::from_str(&ts.to_string())?)
            .header(HDR_SIGNATURE, HeaderValue::from_str(&sig)?)
            .header("content-type", "application/json")
            .body(json)
            .send()
            .await?;
        let status = resp.status();
        let text = resp.text().await?;
        if !status.is_success() {
            anyhow::bail!("POST {} => {status}: {text}", path);
        }
        Ok(serde_json::from_str(&text)?)
    }

    pub async fn register(
        &self,
        hostname: &str,
        agent_version: &str,
        metadata: Option<serde_json::Value>,
    ) -> anyhow::Result<EndpointSnapshot> {
        let req = RegisterRequest {
            endpoint_id: self.endpoint_id.clone(),
            hostname: hostname.into(),
            agent_version: agent_version.into(),
            metadata,
        };
        self.do_post("/v1/register", &req).await
    }

    pub async fn poll(&self, known_version: u64) -> anyhow::Result<EndpointSnapshot> {
        let req = PollRequest {
            endpoint_id: self.endpoint_id.clone(),
            known_version,
        };
        self.do_post("/v1/poll", &req).await
    }

    pub async fn create_tunnel(
        &self,
        local_port: u16,
        protocol: &str,
        subdomain: Option<&str>,
        relay: Option<&str>,
    ) -> anyhow::Result<CreateTunnelResponse> {
        let body = serde_json::json!({
            "localPort": local_port,
            "protocol": protocol,
            "subdomain": subdomain,
            "relay": relay,
        });
        self.do_post("/v1/tunnels", &body).await
    }

    pub async fn tunnel_ready(&self, tunnel_id: &str) -> anyhow::Result<()> {
        let body = serde_json::json!({ "tunnelId": tunnel_id });
        let _: serde_json::Value = self.do_post("/v1/tunnels/ready", &body).await?;
        Ok(())
    }

    pub async fn tunnel_stopped(&self, tunnel_id: &str) -> anyhow::Result<()> {
        let body = serde_json::json!({ "tunnelId": tunnel_id });
        let _: serde_json::Value = self.do_post("/v1/tunnels/stopped", &body).await?;
        Ok(())
    }

    pub async fn tunnel_failed(&self, tunnel_id: &str, error: &str) -> anyhow::Result<()> {
        let body = serde_json::json!({ "tunnelId": tunnel_id, "error": error });
        let _: serde_json::Value = self.do_post("/v1/tunnels/failed", &body).await?;
        Ok(())
    }

    pub async fn create_subnet_route(
        &self,
        cidr: &str,
        description: Option<&str>,
    ) -> anyhow::Result<String> {
        let body = serde_json::json!({
            "cidr": cidr,
            "description": description,
        });
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Resp {
            cidr: String,
        }
        let resp: Resp = self.do_post("/v1/subnet-routes", &body).await?;
        Ok(resp.cidr)
    }
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTunnelResponse {
    pub tunnel_id: String,
    pub subdomain: String,
    pub public_hostname: String,
    pub protocol: String,
    pub local_port: u16,
    pub relay_endpoint_id: String,
    pub relay_domain: String,
    pub auth_token: String,
    #[serde(default)]
    pub redirect_rules: Vec<tuntun_common::RedirectRule>,
}

pub fn basic_metadata(hostname: &str, agent_version: &str, kind: &str) -> serde_json::Value {
    serde_json::json!({
        "hostname": hostname,
        "agentVersion": agent_version,
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH,
        "family": std::env::consts::FAMILY,
        "kind": kind, // "agent" | "sdk"
        "reportedAt": chrono::Utc::now().to_rfc3339(),
    })
}
