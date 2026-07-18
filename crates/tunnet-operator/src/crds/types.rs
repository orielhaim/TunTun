use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Path-based redirect for public tunnels (CRD schema).
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TunnelRedirectRule {
    pub path_pattern: String,
    pub target_port: u16,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_ipv4: Option<String>,
}

impl From<TunnelRedirectRule> for tunnet_common::RedirectRule {
    fn from(rule: TunnelRedirectRule) -> Self {
        Self {
            path_pattern: rule.path_pattern,
            target_port: rule.target_port,
            target_ipv4: rule.target_ipv4.as_deref().and_then(|s| s.parse().ok()),
        }
    }
}

use kube::CustomResource;

/// Shared auth secret reference (optional cross-namespace).
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuthSecretRef {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub namespace: Option<String>,
}

/// Network selection by UUID or human name.
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NetworkRef {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// Backend Kubernetes Service reference.
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServiceRef {
    pub name: String,
    pub port: u16,
}

/// Standard status condition.
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Condition {
    #[serde(rename = "type")]
    pub condition_type: String,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_transition_time: Option<String>,
}

/// Observed node enrolled by the operator.
#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NodeStatus {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ordinal: Option<i32>,
    pub hostname: String,
    pub endpoint_id: String,
    pub mesh_ip: String,
}

// --- TunnetConnector (cluster-scoped) ---

#[derive(CustomResource, Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[kube(
    group = "tunnet.io",
    version = "v1alpha1",
    kind = "TunnetConnector",
    plural = "tunnetconnectors",
    status = "TunnetConnectorStatus",
    shortname = "tnc",
    printcolumn = r#"{"name":"Ready","type":"string","jsonPath":".status.conditions[?(@.type==\"ConnectorReady\")].status"}"#,
    printcolumn = r#"{"name":"Routes","type":"integer","jsonPath":".status.advertisedRoutes.length"}"#,
    printcolumn = r#"{"name":"Age","type":"date","jsonPath":".metadata.creationTimestamp"}"#
)]
#[serde(rename_all = "camelCase")]
pub struct TunnetConnectorSpec {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_secret_ref: Option<AuthSecretRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub control_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub management_url: Option<String>,
    pub network_ref: NetworkRef,
    pub subnet_router: SubnetRouterSpec,
    #[serde(default)]
    pub exit_node: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hostname: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub labels: BTreeMap<String, String>,
    #[serde(default = "default_replicas")]
    pub replicas: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proxy_class_ref: Option<String>,
}

fn default_replicas() -> u32 {
    1
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SubnetRouterSpec {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub routes: Vec<String>,
    #[serde(default)]
    pub auto_discover_cluster_cidrs: bool,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TunnetConnectorStatus {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub conditions: Vec<Condition>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub nodes: Vec<NodeStatus>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub advertised_routes: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub observed_generation: Option<i64>,
}

// --- TunnetIngress (namespaced) ---

#[derive(CustomResource, Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[kube(
    group = "tunnet.io",
    version = "v1alpha1",
    kind = "TunnetIngress",
    plural = "tunnetingresses",
    namespaced,
    status = "TunnetIngressStatus",
    shortname = "tni",
    printcolumn = r#"{"name":"Ready","type":"string","jsonPath":".status.conditions[?(@.type==\"IngressReady\")].status"}"#,
    printcolumn = r#"{"name":"Hostname","type":"string","jsonPath":".status.meshHostname"}"#,
    printcolumn = r#"{"name":"Age","type":"date","jsonPath":".metadata.creationTimestamp"}"#
)]
#[serde(rename_all = "camelCase")]
pub struct TunnetIngressSpec {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_secret_ref: Option<AuthSecretRef>,
    pub network_ref: NetworkRef,
    pub service: ServiceRef,
    pub serve: ServeSpec,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proxy_group_ref: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServeSpec {
    pub hostname: String,
    #[serde(default = "default_https")]
    pub protocol: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tls: Option<ServeTlsSpec>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub acl: Option<ServeAclSpec>,
}

fn default_https() -> String {
    "https".into()
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServeTlsSpec {
    #[serde(default)]
    pub from_org_ca: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServeAclSpec {
    #[serde(default = "default_acl_mode")]
    pub mode: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub allow_tags: Vec<String>,
}

fn default_acl_mode() -> String {
    "all_peers".into()
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TunnetIngressStatus {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub conditions: Vec<Condition>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mesh_hostname: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mesh_ip: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub observed_generation: Option<i64>,
}

// --- TunnetTunnel (namespaced) ---

#[derive(CustomResource, Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[kube(
    group = "tunnet.io",
    version = "v1alpha1",
    kind = "TunnetTunnel",
    plural = "tunnettunnels",
    namespaced,
    status = "TunnetTunnelStatus",
    shortname = "tnt",
    printcolumn = r#"{"name":"Ready","type":"string","jsonPath":".status.conditions[?(@.type==\"TunnelReady\")].status"}"#,
    printcolumn = r#"{"name":"Public URL","type":"string","jsonPath":".status.publicUrl"}"#,
    printcolumn = r#"{"name":"Age","type":"date","jsonPath":".metadata.creationTimestamp"}"#
)]
#[serde(rename_all = "camelCase")]
pub struct TunnetTunnelSpec {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_secret_ref: Option<AuthSecretRef>,
    pub network_ref: NetworkRef,
    pub service: ServiceRef,
    pub tunnel: TunnelSpec,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proxy_group_ref: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TunnelSpec {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub relay_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subdomain: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_domain: Option<String>,
    #[serde(default = "default_https")]
    pub protocol: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub redirect_rules: Vec<TunnelRedirectRule>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TunnetTunnelStatus {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub conditions: Vec<Condition>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub public_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom_domain_verified: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub observed_generation: Option<i64>,
}

// --- TunnetEgress (namespaced) ---

#[derive(CustomResource, Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[kube(
    group = "tunnet.io",
    version = "v1alpha1",
    kind = "TunnetEgress",
    plural = "tunnetegresses",
    namespaced,
    status = "TunnetEgressStatus",
    shortname = "tne",
    printcolumn = r#"{"name":"Ready","type":"string","jsonPath":".status.conditions[?(@.type==\"EgressReady\")].status"}"#,
    printcolumn = r#"{"name":"Target","type":"string","jsonPath":".status.targetMeshIP"}"#,
    printcolumn = r#"{"name":"Age","type":"date","jsonPath":".metadata.creationTimestamp"}"#
)]
#[serde(rename_all = "camelCase")]
pub struct TunnetEgressSpec {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_secret_ref: Option<AuthSecretRef>,
    pub network_ref: NetworkRef,
    pub target: EgressTargetSpec,
    pub cluster_service: ClusterServiceSpec,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proxy_group_ref: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EgressTargetSpec {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hostname: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mesh_ip: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub endpoint_id: Option<String>,
    pub port: u16,
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClusterServiceSpec {
    pub name: String,
    pub port: u16,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TunnetEgressStatus {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub conditions: Vec<Condition>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_mesh_ip: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cluster_service_ip: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub observed_generation: Option<i64>,
}

// --- TunnetProxyGroup (cluster-scoped) ---

#[derive(CustomResource, Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[kube(
    group = "tunnet.io",
    version = "v1alpha1",
    kind = "TunnetProxyGroup",
    plural = "tunnetproxygroups",
    status = "TunnetProxyGroupStatus",
    shortname = "tnpg",
    printcolumn = r#"{"name":"Type","type":"string","jsonPath":".spec.type"}"#,
    printcolumn = r#"{"name":"Ready","type":"string","jsonPath":".status.readyReplicas"}"#,
    printcolumn = r#"{"name":"Age","type":"date","jsonPath":".metadata.creationTimestamp"}"#
)]
#[serde(rename_all = "camelCase")]
pub struct TunnetProxyGroupSpec {
    /// `ingress` | `egress` | `connector` | `tunnel`
    #[serde(rename = "type")]
    pub proxy_type: String,
    #[serde(default = "default_replicas")]
    pub replicas: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_secret_ref: Option<AuthSecretRef>,
    pub network_ref: NetworkRef,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proxy_class_ref: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TunnetProxyGroupStatus {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub conditions: Vec<Condition>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ready_replicas: Option<u32>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub nodes: Vec<NodeStatus>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub observed_generation: Option<i64>,
}

// --- TunnetProxyClass (cluster-scoped) ---

#[derive(CustomResource, Clone, Debug, Deserialize, Serialize, JsonSchema)]
#[kube(
    group = "tunnet.io",
    version = "v1alpha1",
    kind = "TunnetProxyClass",
    plural = "tunnetproxyclasses",
    status = "TunnetProxyClassStatus",
    shortname = "tnpc"
)]
#[serde(rename_all = "camelCase")]
pub struct TunnetProxyClassSpec {
    pub pod: ProxyClassPodSpec,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metrics: Option<ProxyClassMetricsSpec>,
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProxyClassPodSpec {
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub labels: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub annotations: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resources: Option<ProxyClassResources>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tolerations: Vec<ProxyClassToleration>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub node_selector: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub security_context: Option<ProxyClassSecurityContext>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub image_pull_secrets: Vec<LocalObjectRef>,
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalObjectRef {
    pub name: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProxyClassResources {
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub requests: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub limits: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProxyClassToleration {
    pub key: String,
    pub operator: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    pub effect: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProxyClassSecurityContext {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub capabilities: Option<ProxyClassCapabilities>,
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProxyClassCapabilities {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub add: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, JsonSchema, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProxyClassMetricsSpec {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_metrics_port")]
    pub port: u16,
}

fn default_true() -> bool {
    true
}

fn default_metrics_port() -> u16 {
    9090
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct TunnetProxyClassStatus {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub conditions: Vec<Condition>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub observed_generation: Option<i64>,
}

impl NetworkRef {
    pub fn network_id(&self) -> anyhow::Result<uuid::Uuid> {
        if let Some(id) = &self.id {
            return uuid::Uuid::parse_str(id)
                .map_err(|e| anyhow::anyhow!("invalid networkRef.id: {e}"));
        }
        if let Some(name) = &self.name {
            anyhow::bail!(
                "networkRef.name ({name}) resolution is not implemented; set networkRef.id"
            );
        }
        anyhow::bail!("networkRef requires id or name")
    }
}
