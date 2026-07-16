//! Coordinator firewall policy distribution via iroh-docs keys under `policy/v1/*`.
//!
//! Signed with HMAC-BLAKE3 over the network PSK.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::firewall::FirewallRule;

pub const POLICY_GLOBAL_KEY: &str = "policy/v1/global";
pub const POLICY_META_KEY: &str = "policy/v1/meta";

pub fn policy_hostname_key(hostname: &str) -> String {
    format!("policy/v1/hostname/{hostname}")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyMeta {
    pub version: u64,
    pub timestamp: String,
    /// Hex-encoded HMAC-BLAKE3 signature.
    pub signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SuggestedPolicy {
    pub meta: PolicyMeta,
    pub global: Vec<FirewallRule>,
    /// hostname → rules
    pub by_hostname: HashMap<String, Vec<FirewallRule>>,
}

/// Canonical bytes signed by the coordinator.
pub fn canonical_payload(
    version: u64,
    timestamp: &str,
    global: &[FirewallRule],
    by_hostname: &HashMap<String, Vec<FirewallRule>>,
) -> anyhow::Result<Vec<u8>> {
    #[derive(Serialize)]
    struct Canon<'a> {
        version: u64,
        timestamp: &'a str,
        global: &'a [FirewallRule],
        by_hostname: &'a HashMap<String, Vec<FirewallRule>>,
    }
    Ok(serde_json::to_vec(&Canon {
        version,
        timestamp,
        global,
        by_hostname,
    })?)
}

pub fn sign_policy(psk: &str, payload: &[u8]) -> String {
    let key = blake3::hash(psk.as_bytes());
    let mut mac = blake3::Hasher::new_keyed(key.as_bytes());
    mac.update(payload);
    hex::encode(mac.finalize().as_bytes())
}

pub fn verify_policy(psk: &str, payload: &[u8], signature_hex: &str) -> bool {
    let expected = sign_policy(psk, payload);
    // Constant-time-ish compare
    expected.as_bytes() == signature_hex.as_bytes() || expected.eq_ignore_ascii_case(signature_hex)
}

/// Rules that apply to a given hostname (global + host-specific).
pub fn effective_suggested(policy: &SuggestedPolicy, hostname: &str) -> Vec<FirewallRule> {
    let mut rules = policy.global.clone();
    if let Some(host_rules) = policy.by_hostname.get(hostname) {
        rules.extend(host_rules.iter().cloned());
    }
    rules
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingSuggestion {
    pub received_at: String,
    pub policy: SuggestedPolicy,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::direct::firewall::{FirewallAction, FirewallDirection, PeerFilter};
    use tunnet_common::policy::Protocol;

    #[test]
    fn sign_verify_roundtrip() {
        let mut by = HashMap::new();
        by.insert(
            "alice".into(),
            vec![FirewallRule {
                direction: FirewallDirection::In,
                action: FirewallAction::Allow,
                protocol: Protocol::Tcp,
                ports: vec![],
                peer: PeerFilter::Any,
            }],
        );
        let global = vec![];
        let payload = canonical_payload(1, "2026-01-01T00:00:00Z", &global, &by).unwrap();
        let sig = sign_policy("secret", &payload);
        assert!(verify_policy("secret", &payload, &sig));
        assert!(!verify_policy("wrong", &payload, &sig));
    }
}
