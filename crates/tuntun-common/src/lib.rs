pub mod ipv6;
pub mod policy;
pub mod signing;
pub mod ws;

use serde::{Deserialize, Serialize};
use std::net::{Ipv4Addr, Ipv6Addr};
use uuid::Uuid;

pub type EndpointIdHex = String;

/// ALPN identifier for our tunnel protocol.
pub const TUNNEL_ALPN: &[u8] = b"tuntun/tunnel/1";

/// Header the agent sends with every authenticated request.
pub const HDR_ENDPOINT_ID: &str = "x-endpoint-id";
pub const HDR_TIMESTAMP: &str = "x-timestamp";
pub const HDR_SIGNATURE: &str = "x-endpoint-signature";
pub const HDR_TRACE_ID: &str = "x-trace-id";

/// Maximum allowed clock skew for signature validation.
pub const MAX_SKEW_SECS: i64 = 60;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnrollRequest {
    pub enrollment_token: String,
    pub endpoint_id: EndpointIdHex,
    pub hostname: String,
    pub os: String,
    pub agent_version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnrollResponse {
    pub organization_id: String,
    pub network_id: Uuid,
    pub network_name: String,
    pub snapshot: EndpointSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisterRequest {
    pub endpoint_id: EndpointIdHex,
    pub hostname: String,
    pub agent_version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PollRequest {
    pub endpoint_id: EndpointIdHex,
    pub known_version: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerEntry {
    pub ip: Ipv4Addr,
    pub endpoint_id: EndpointIdHex,
    pub hostname: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubnetRoute {
    pub cidr: ipnet::Ipv4Net,
    pub via_endpoint_id: EndpointIdHex,
    pub via_ip: Ipv4Addr,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostnameRoute {
    pub hostname: String,
    pub via_endpoint_id: EndpointIdHex,
    pub via_ip: Ipv4Addr,
    #[serde(default)]
    pub is_wildcard: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_ip: Option<Ipv4Addr>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DnsConfig {
    pub suffix: String,
    #[serde(default)]
    pub upstream: Vec<std::net::IpAddr>,
    pub synthetic_base: Ipv4Addr,
}

impl Default for DnsConfig {
    fn default() -> Self {
        Self {
            suffix: "tuntun".into(),
            upstream: vec![
                std::net::IpAddr::V4(Ipv4Addr::new(1, 1, 1, 1)),
                std::net::IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8)),
            ],
            // CGNAT-style pool reserved for PeerDNS hostname routes.
            synthetic_base: Ipv4Addr::new(100, 100, 0, 1),
        }
    }
}

/// Exit node advertisement in the snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExitNodeInfo {
    pub endpoint_id: EndpointIdHex,
    pub via_ip: Ipv4Addr,
    pub allowed_cidrs: Vec<ipnet::Ipv4Net>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SplitTunnelMode {
    Include,
    Exclude,
}

impl Default for SplitTunnelMode {
    fn default() -> Self {
        Self::Exclude
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DeviceProfile {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exit_node_endpoint_id: Option<EndpointIdHex>,
    #[serde(default)]
    pub split_tunnel_mode: SplitTunnelMode,
    #[serde(default)]
    pub split_tunnel_cidrs: Vec<ipnet::Ipv4Net>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ipv6PeerEntry {
    pub ip: Ipv6Addr,
    pub endpoint_id: EndpointIdHex,
    pub hostname: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkMembershipSnapshot {
    pub network_id: Uuid,
    pub network_name: String,
    pub assigned_ipv4: Ipv4Addr,
    pub prefix: u8,
    pub mtu: u16,
    pub ipv4_peers: Vec<PeerEntry>,
    /// Subnet routes visible to this peer (enabled routes in the network).
    #[serde(default)]
    pub subnet_routes: Vec<SubnetRoute>,
    /// Hostname routes visible to this peer.
    #[serde(default)]
    pub hostname_routes: Vec<HostnameRoute>,
    #[serde(default)]
    pub dns: DnsConfig,
    /// Exit nodes available in this network.
    #[serde(default)]
    pub exit_nodes: Vec<ExitNodeInfo>,
    /// This device's profile (exit selection + split tunnel).
    #[serde(default)]
    pub device_profile: DeviceProfile,
    pub policy: policy::PolicyBundle,
    pub gossip_bootstrap: Vec<EndpointIdHex>,
    pub gossip_topic_hex: String,
    pub version: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndpointSnapshot {
    pub ipv6_enabled: bool,
    pub tenant_ipv6: Option<Ipv6Addr>,
    pub memberships: Vec<NetworkMembershipSnapshot>,
    pub ipv6_peers: Vec<Ipv6PeerEntry>,
    pub org_policy: policy::PolicyBundle,
    pub version: u64,
}

/// Legacy alias kept for incremental migration in agent code paths.
pub type NetworkSnapshot = NetworkMembershipSnapshot;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotDelta {
    pub added: Vec<PeerEntry>,
    pub removed: Vec<EndpointIdHex>,
    pub version: u64,
}

#[derive(Debug, thiserror::Error)]
pub enum ProtocolError {
    #[error("invalid endpoint id: {0}")]
    InvalidEndpointId(String),
    #[error("network is full")]
    NetworkFull,
    #[error("unauthorized")]
    Unauthorized,
    #[error("signature invalid")]
    BadSignature,
    #[error("stale timestamp")]
    StaleTimestamp,
}

pub fn validate_endpoint_id(s: &str) -> Result<(), ProtocolError> {
    if s.len() != 64 || !s.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(ProtocolError::InvalidEndpointId(s.to_string()));
    }
    Ok(())
}

pub fn validate_network_name(s: &str) -> bool {
    let len_ok = (3..=32).contains(&s.len());
    let chars_ok = s
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    len_ok && chars_ok
}

pub fn network_topic_hex(id: &uuid::Uuid) -> String {
    hex::encode(blake3::hash(id.as_bytes()).as_bytes())
}
