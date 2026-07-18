//! Remote Policy-as-Code API client helpers for `tunnet policy` CLI.

use anyhow::{Context, Result, bail};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderValue};
use serde_json::Value;

pub struct PolicyApi {
    pub base_url: String,
    pub api_key: String,
    pub org_id: String,
}

impl PolicyApi {
    pub fn from_env() -> Result<Self> {
        let base_url = std::env::var("TUNNET_API_URL")
            .context("TUNNET_API_URL is required for remote policy commands")?;
        let api_key = std::env::var("TUNNET_API_KEY")
            .context("TUNNET_API_KEY is required for remote policy commands")?;
        let org_id = std::env::var("TUNNET_ORGANIZATION_ID")
            .context("TUNNET_ORGANIZATION_ID is required for remote policy commands")?;
        Ok(Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key,
            org_id,
        })
    }

    fn client(&self) -> Result<reqwest::Client> {
        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", self.api_key))
                .context("invalid API key header")?,
        );
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        reqwest::Client::builder()
            .default_headers(headers)
            .build()
            .context("build HTTP client")
    }

    fn url(&self, path: &str) -> String {
        format!(
            "{}/api/v1/organizations/{}{}",
            self.base_url, self.org_id, path
        )
    }

    pub async fn post_json(&self, path: &str, body: &Value) -> Result<(u16, Value)> {
        let client = self.client()?;
        let res = client
            .post(self.url(path))
            .json(body)
            .send()
            .await
            .context("policy API request")?;
        let status = res.status().as_u16();
        let text = res.text().await.unwrap_or_default();
        let value: Value =
            serde_json::from_str(&text).unwrap_or_else(|_| serde_json::json!({ "raw": text }));
        Ok((status, value))
    }

    pub async fn get_json(&self, path: &str) -> Result<(u16, Value)> {
        let client = self.client()?;
        let res = client
            .get(self.url(path))
            .send()
            .await
            .context("policy API request")?;
        let status = res.status().as_u16();
        let text = res.text().await.unwrap_or_default();
        let value: Value =
            serde_json::from_str(&text).unwrap_or_else(|_| serde_json::json!({ "raw": text }));
        Ok((status, value))
    }
}

pub fn require_ok(status: u16, body: &Value, what: &str) -> Result<()> {
    if (200..300).contains(&status) {
        return Ok(());
    }
    bail!("{what} failed (HTTP {status}): {body}");
}
