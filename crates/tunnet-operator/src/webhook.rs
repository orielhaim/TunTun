use std::path::Path;
use std::sync::Arc;

use axum::{Json, Router, extract::State, http::StatusCode, routing::post};
use axum_server::tls_rustls::RustlsConfig;
use base64::Engine;
use k8s_openapi::api::core::v1::Container;
use serde_json::{Value, json};

use crate::INJECT_ANNOTATION;
use crate::OperatorContext;

#[derive(Clone)]
pub struct WebhookState {
    pub ctx: Arc<OperatorContext>,
}

pub fn router(state: WebhookState) -> Router {
    Router::new()
        .route("/mutate", post(mutate))
        .with_state(state)
}

/// Serve the mutating webhook over TLS (required by the API server).
pub async fn serve_tls(
    addr: std::net::SocketAddr,
    app: Router,
    cert_pem: &str,
    key_pem: &str,
) -> anyhow::Result<()> {
    let config =
        RustlsConfig::from_pem(cert_pem.as_bytes().to_vec(), key_pem.as_bytes().to_vec()).await?;
    axum_server::bind_rustls(addr, config)
        .serve(app.into_make_service())
        .await?;
    Ok(())
}

/// Load TLS material from disk, or generate a self-signed pair for the webhook Service DNS names.
pub async fn load_or_generate_tls(
    cert_path: Option<&Path>,
    key_path: Option<&Path>,
    service_name: &str,
    namespace: &str,
) -> anyhow::Result<(String, String)> {
    if let (Some(cert), Some(key)) = (cert_path, key_path)
        && cert.is_file()
        && key.is_file()
    {
        let cert_pem = tokio::fs::read_to_string(cert).await?;
        let key_pem = tokio::fs::read_to_string(key).await?;
        return Ok((cert_pem, key_pem));
    }
    tracing::warn!(
        "webhook TLS cert/key not found; generating ephemeral self-signed certificate \
         (mount a Secret for production)"
    );
    generate_webhook_tls(service_name, namespace)
}

async fn mutate(
    State(state): State<WebhookState>,
    Json(review): Json<Value>,
) -> Result<Json<Value>, StatusCode> {
    let Some(request) = review.get("request") else {
        return Err(StatusCode::BAD_REQUEST);
    };
    let uid = request
        .get("uid")
        .and_then(|v| v.as_str())
        .unwrap_or_default();

    let should_inject = request
        .get("object")
        .and_then(|o| o.get("metadata"))
        .and_then(|m| m.get("annotations"))
        .and_then(|a| a.get(INJECT_ANNOTATION))
        .and_then(|v| v.as_str())
        .is_some_and(|v| v == "true" || v == "enabled");

    let mut response = json!({
        "uid": uid,
        "allowed": true,
    });

    if should_inject && let Ok(patch_bytes) = build_sidecar_patch(request.get("object"), &state.ctx)
    {
        let encoded = base64::engine::general_purpose::STANDARD.encode(&patch_bytes);
        response["patch"] = json!(encoded);
        response["patchType"] = json!("JSONPatch");
    }

    Ok(Json(json!({
        "apiVersion": "admission.k8s.io/v1",
        "kind": "AdmissionReview",
        "response": response,
    })))
}

fn build_sidecar_patch(object: Option<&Value>, ctx: &OperatorContext) -> anyhow::Result<Vec<u8>> {
    let annotations = object
        .and_then(|o| o.get("metadata"))
        .and_then(|m| m.get("annotations"))
        .and_then(|a| a.as_object());

    let hostname = annotations
        .and_then(|a| a.get("tunnet.io/hostname"))
        .and_then(|v| v.as_str())
        .unwrap_or("sidecar");

    let tags = annotations
        .and_then(|a| a.get("tunnet.io/tags"))
        .and_then(|v| v.as_str())
        .unwrap_or("");

    let sidecar = Container {
        name: "tunnet-sidecar".into(),
        image: Some(ctx.kube_node_image.clone()),
        image_pull_policy: Some("IfNotPresent".into()),
        env: Some(vec![
            k8s_openapi::api::core::v1::EnvVar {
                name: "TUNNET_MODE".into(),
                value: Some("sidecar".into()),
                ..Default::default()
            },
            k8s_openapi::api::core::v1::EnvVar {
                name: "HOSTNAME".into(),
                value: Some(hostname.to_string()),
                ..Default::default()
            },
            k8s_openapi::api::core::v1::EnvVar {
                name: "TUNNET_KIND".into(),
                value: Some("k8s-sidecar".into()),
                ..Default::default()
            },
            k8s_openapi::api::core::v1::EnvVar {
                name: "TUNNET_TAGS".into(),
                value: Some(tags.to_string()),
                ..Default::default()
            },
        ]),
        ports: Some(vec![k8s_openapi::api::core::v1::ContainerPort {
            name: Some("health".into()),
            container_port: 8080,
            ..Default::default()
        }]),
        ..Default::default()
    };

    let patch = json!([{
        "op": "add",
        "path": "/spec/containers/-",
        "value": sidecar,
    }]);

    Ok(serde_json::to_vec(&patch)?)
}

/// Generate a self-signed TLS certificate PEM for the mutating webhook server.
pub fn generate_webhook_tls(
    service_name: &str,
    namespace: &str,
) -> anyhow::Result<(String, String)> {
    let mut params = rcgen::CertificateParams::new(vec![
        format!("{service_name}.{namespace}.svc"),
        format!("{service_name}.{namespace}.svc.cluster.local"),
    ])?;
    params.distinguished_name = rcgen::DistinguishedName::new();
    params
        .distinguished_name
        .push(rcgen::DnType::CommonName, "tunnet-operator-webhook");
    let key_pair = rcgen::KeyPair::generate()?;
    let cert = params.self_signed(&key_pair)?;
    Ok((cert.pem(), key_pair.serialize_pem()))
}

/// Emit all CRD manifests as YAML documents (for Helm / install).
pub fn print_all_crds() -> anyhow::Result<String> {
    use crate::crds::{
        TunnetConnector, TunnetEgress, TunnetIngress, TunnetProxyClass, TunnetProxyGroup,
        TunnetTunnel,
    };
    use kube::CustomResourceExt;

    let crds = [
        TunnetConnector::crd(),
        TunnetIngress::crd(),
        TunnetTunnel::crd(),
        TunnetEgress::crd(),
        TunnetProxyGroup::crd(),
        TunnetProxyClass::crd(),
    ];

    let mut out = String::new();
    for (i, crd) in crds.iter().enumerate() {
        if i > 0 {
            out.push_str("---\n");
        }
        out.push_str(&yaml_serde::to_string(crd)?);
    }
    Ok(out)
}
