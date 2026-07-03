pub mod ipv6;
pub mod policy;
pub mod signing;
pub mod ws;

use serde::{Deserialize, Serialize};
use std::net::{Ipv4Addr, Ipv6Addr};
use uuid::Uuid;

/// Iroh EndpointId serialised as a lowercase-hex 32-byte public key (64 chars).
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
