pub mod auth;
pub mod controllers;
pub mod crds;
pub mod enroll;
pub mod health;
pub mod leader;
pub mod resources;
pub mod webhook;

use std::sync::Arc;

use kube::Client;
use serde::Deserialize;

use crate::crds::AuthSecretRef;

pub const GROUP: &str = "tunnet.io";
pub const VERSION: &str = "v1alpha1";
pub const FINALIZER: &str = "tunnet.io/finalizer";
pub const DEFAULT_NAMESPACE: &str = "tunnet-system";
pub const INJECT_ANNOTATION: &str = "tunnet.io/inject";
pub const KUBE_NODE_IMAGE_ENV: &str = "TUNNET_KUBE_NODE_IMAGE";

#[derive(Clone)]
pub struct OperatorContext {
    pub client: Client,
    pub operator_namespace: String,
    pub pod_name: String,
    pub kube_node_image: String,
    pub node_expires_in: String,
    pub default_auth_secret: Option<AuthSecretRef>,
    pub health_addr: std::net::SocketAddr,
    pub webhook_addr: std::net::SocketAddr,
    pub metrics_enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RunConfig {
    pub namespace: String,
    pub pod_name: String,
    pub kube_node_image: String,
    pub node_expires_in: String,
    pub default_auth_secret: Option<AuthSecretRef>,
    pub health_addr: std::net::SocketAddr,
    pub webhook_addr: std::net::SocketAddr,
    pub metrics_enabled: bool,
}

impl RunConfig {
    pub fn into_context(self, client: Client) -> Arc<OperatorContext> {
        Arc::new(OperatorContext {
            client,
            operator_namespace: self.namespace,
            pod_name: self.pod_name,
            kube_node_image: self.kube_node_image,
            node_expires_in: self.node_expires_in,
            default_auth_secret: self.default_auth_secret,
            health_addr: self.health_addr,
            webhook_addr: self.webhook_addr,
            metrics_enabled: self.metrics_enabled,
        })
    }
}

pub async fn build_client() -> anyhow::Result<Client> {
    Ok(Client::try_default().await?)
}
