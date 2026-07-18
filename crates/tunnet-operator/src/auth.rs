use std::collections::BTreeMap;

use anyhow::Context;
use k8s_openapi::api::core::v1::Secret;
use kube::Api;

use crate::OperatorContext;
use crate::crds::AuthSecretRef;

#[derive(Clone, Debug)]
pub struct AuthCredentials {
    pub api_key: String,
    pub org_id: String,
    pub control_url: String,
    pub management_url: String,
}

pub async fn load_auth_credentials(
    ctx: &OperatorContext,
    secret_ref: Option<&AuthSecretRef>,
    control_url_override: Option<&str>,
    management_url_override: Option<&str>,
) -> anyhow::Result<AuthCredentials> {
    let secret_ref = secret_ref
        .cloned()
        .or_else(|| ctx.default_auth_secret.clone())
        .context("authSecretRef is required (set on CR or operator default)")?;

    let ns = secret_ref
        .namespace
        .as_deref()
        .unwrap_or(&ctx.operator_namespace);
    let secrets: Api<Secret> = Api::namespaced(ctx.client.clone(), ns);
    let secret = secrets
        .get(&secret_ref.name)
        .await
        .with_context(|| format!("read auth secret {}/{}", ns, secret_ref.name))?;

    let data = secret.data.context("auth secret has no data")?;
    let mut creds = AuthCredentials {
        api_key: read_secret_key(&data, &["api_key", "apiKey"])?,
        org_id: read_secret_key(&data, &["org_id", "orgId"])?,
        control_url: read_secret_key(&data, &["control_url", "controlUrl"])?,
        management_url: read_secret_key(&data, &["management_url", "managementUrl"])?,
    };

    if let Some(url) = control_url_override {
        creds.control_url = url.to_string();
    }
    if let Some(url) = management_url_override {
        creds.management_url = url.to_string();
    }

    Ok(creds)
}

fn read_secret_key(
    data: &BTreeMap<String, k8s_openapi::ByteString>,
    keys: &[&str],
) -> anyhow::Result<String> {
    for key in keys {
        if let Some(raw) = data.get(*key) {
            return String::from_utf8(raw.0.clone())
                .with_context(|| format!("secret key {key} is not valid UTF-8"));
        }
    }
    anyhow::bail!("missing secret key (expected one of: {})", keys.join(", "))
}
