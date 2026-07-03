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
            anyhow::bail!("{} {} => {status}: {text}", "POST", path);
        }
        Ok(serde_json::from_str(&text)?)
    }

    pub async fn register(&self, hostname: &str) -> anyhow::Result<EndpointSnapshot> {
        let agent_version = env!("CARGO_PKG_VERSION").into();
        let metadata =
            crate::system_info::collect_system_metadata(hostname, env!("CARGO_PKG_VERSION"));
        let req = RegisterRequest {
            endpoint_id: self.endpoint_id.clone(),
            hostname: hostname.into(),
            agent_version,
            metadata: Some(metadata),
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
}
