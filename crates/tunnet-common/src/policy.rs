use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::{Ipv4Addr, Ipv6Addr};

use crate::posture::PostureEnforcementConfig;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Action {
    Allow,
    Deny,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    Tcp,
    Udp,
    Icmp,
    Any,
}

/// Stable selector kinds for Policy-as-Code (IR + wire).
/// Syntax in documents: `tag:X`, `user:email`, `group:user:name`, `group:device:name`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "lowercase")]
pub enum Selector {
    Any,
    Endpoint(String),
    Tag(String),
    Network(String),
    Cidr(String),
    /// Org user group name (`group:user:<name>`). Expanded at compile time when possible.
    #[serde(rename = "user_group")]
    UserGroup(String),
    /// Device group name (`group:device:<name>`). Expanded at compile time when possible.
    #[serde(rename = "device_group")]
    DeviceGroup(String),
    /// User email or id (`user:<email>`).
    User(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyRule {
    pub src: Selector,
    pub dst: Selector,
    pub action: Action,
    /// Empty means "any port".
    #[serde(default)]
    pub ports: Vec<PortRange>,
    #[serde(default)]
    pub protocol: Option<Protocol>,
    pub priority: i32,
    /// Posture definition names required on the source device (OR semantics).
    #[serde(default)]
    pub src_posture: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct PortRange {
    pub start: u16,
    pub end: u16,
}

impl PortRange {
    pub fn contains(&self, p: u16) -> bool {
        p >= self.start && p <= self.end
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PolicyBundle {
    pub rules: Vec<PolicyRule>,
    /// Application-level SSH access rules (separate from L3/L4 ACL).
    #[serde(default)]
    pub ssh_rules: Vec<SshPolicyRule>,
    pub version: u64,
    /// base64 Ed25519 signature by the control plane's policy key.
    #[serde(default)]
    pub signature: String,
    /// Org posture definitions: name → assertion strings.
    #[serde(default)]
    pub postures: HashMap<String, Vec<String>>,
    /// Default posture names applied to ACL rules without `src_posture`.
    #[serde(default)]
    pub default_src_posture: Vec<String>,
    #[serde(default)]
    pub posture_enforcement: Option<PostureEnforcementConfig>,
}

pub const AUTOGROUP_NONROOT: &str = "autogroup:nonroot";
pub const AUTOGROUP_LOCAL: &str = "autogroup:local";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SshAction {
    Accept,
    Check,
    Deny,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshPolicyRule {
    pub src: Selector,
    pub dst: Selector,
    pub action: SshAction,
    /// POSIX users the src may connect as (literals or autogroups).
    #[serde(default)]
    pub users: Vec<String>,
    #[serde(default)]
    pub record: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recorder: Option<Selector>,
    #[serde(default)]
    pub enforce_recorder: bool,
    /// For `action=check`: how long an IdP re-auth remains valid (seconds).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub check_period_secs: Option<u64>,
    pub priority: i32,
}

#[derive(Debug, Clone)]
pub struct SshEvalCtx<'a> {
    pub src_endpoint_hex: &'a str,
    pub src_tags: &'a [String],
    pub src_network: &'a str,
    pub dst_endpoint_hex: &'a str,
    pub dst_tags: &'a [String],
    pub dst_network: &'a str,
    pub requested_user: &'a str,
    pub local_user: &'a str,
}

/// First matching SSH rule by priority (desc). `None` means implicit deny.
pub fn evaluate_ssh<'a>(
    rules: &'a [SshPolicyRule],
    ctx: &SshEvalCtx<'_>,
) -> Option<&'a SshPolicyRule> {
    let mut sorted: Vec<&SshPolicyRule> = rules.iter().collect();
    sorted.sort_by_key(|rule| std::cmp::Reverse(rule.priority));

    for rule in sorted {
        if !ssh_rule_matches(rule, ctx) {
            continue;
        }
        return Some(rule);
    }
    None
}

fn ssh_rule_matches(rule: &SshPolicyRule, ctx: &SshEvalCtx<'_>) -> bool {
    let src_ok =
        rule.src
            .matches_endpoint(ctx.src_endpoint_hex, ctx.src_tags, ctx.src_network, None);
    let dst_ok =
        rule.dst
            .matches_endpoint(ctx.dst_endpoint_hex, ctx.dst_tags, ctx.dst_network, None);
    if !src_ok || !dst_ok {
        return false;
    }
    ssh_user_allowed(&rule.users, ctx.requested_user, ctx.local_user)
}

fn ssh_user_allowed(users: &[String], requested: &str, local_user: &str) -> bool {
    if users.is_empty() {
        return false;
    }
    users.iter().any(|u| {
        if u == AUTOGROUP_NONROOT {
            requested != "root"
        } else if u == AUTOGROUP_LOCAL {
            requested == local_user
        } else {
            u == requested
        }
    })
}

/// Runtime facts needed to evaluate a rule against a packet or connection.
#[derive(Debug, Clone)]
pub struct EvalCtx<'a> {
    pub self_endpoint_hex: &'a str,
    pub self_ip: Ipv4Addr,
    pub self_tags: &'a [String],
    pub self_network: &'a str,
    pub peer_endpoint_hex: &'a str,
    pub peer_ip: Option<Ipv4Addr>,
    pub peer_tags: &'a [String],
    pub peer_network: &'a str,
    pub dst_port: Option<u16>,
    pub protocol: Protocol,
    /// When false, rules with non-empty `src_posture` do not match.
    pub src_posture_ok: bool,
}

#[derive(Debug, Clone)]
pub struct Ipv6EvalCtx<'a> {
    pub self_endpoint_hex: &'a str,
    pub self_ipv6: Ipv6Addr,
    pub self_tags: &'a [String],
    pub peer_endpoint_hex: &'a str,
    pub peer_ipv6: Option<Ipv6Addr>,
    pub peer_tags: &'a [String],
    pub dst_port: Option<u16>,
    pub protocol: Protocol,
    /// When false, rules with non-empty `src_posture` do not match.
    pub src_posture_ok: bool,
}

impl Selector {
    pub fn matches_endpoint(
        &self,
        endpoint_hex: &str,
        tags: &[String],
        network: &str,
        ip: Option<Ipv4Addr>,
    ) -> bool {
        match self {
            Selector::Any => true,
            Selector::Endpoint(id) => id.eq_ignore_ascii_case(endpoint_hex),
            Selector::Tag(t) => tags.iter().any(|x| x == t),
            Selector::Network(n) => n == network,
            Selector::Cidr(cidr) => match (ip, cidr.parse::<ipnet::Ipv4Net>()) {
                (Some(ip), Ok(net)) => net.contains(&ip),
                _ => false,
            },
            // Compile-time expansion should replace these with Tag/Endpoint/User.
            // Until then, match synthetic tags `ug:<name>` / `dg:<name>` / `user:<id>`.
            Selector::UserGroup(name) => {
                let marker = format!("ug:{name}");
                tags.iter().any(|x| x == &marker || x == name)
            }
            Selector::DeviceGroup(name) => {
                let marker = format!("dg:{name}");
                tags.iter().any(|x| x == &marker || x == name)
            }
            Selector::User(id) => {
                let marker = format!("user:{id}");
                tags.iter()
                    .any(|x| x == &marker || x.eq_ignore_ascii_case(id))
            }
        }
    }

    pub fn matches_ipv6_endpoint(
        &self,
        endpoint_hex: &str,
        tags: &[String],
        ipv6: Option<Ipv6Addr>,
    ) -> bool {
        match self {
            Selector::Any => true,
            Selector::Endpoint(id) => id.eq_ignore_ascii_case(endpoint_hex),
            Selector::Tag(t) => tags.iter().any(|x| x == t),
            Selector::Network(_) => false,
            Selector::Cidr(cidr) => match (ipv6, cidr.parse::<ipnet::IpNet>()) {
                (Some(ip), Ok(net)) => net.contains(&std::net::IpAddr::V6(ip)),
                _ => false,
            },
            Selector::UserGroup(name) => {
                let marker = format!("ug:{name}");
                tags.iter().any(|x| x == &marker || x == name)
            }
            Selector::DeviceGroup(name) => {
                let marker = format!("dg:{name}");
                tags.iter().any(|x| x == &marker || x == name)
            }
            Selector::User(id) => {
                let marker = format!("user:{id}");
                tags.iter()
                    .any(|x| x == &marker || x.eq_ignore_ascii_case(id))
            }
        }
    }
}

/// Merge org-scoped and network-scoped bundles into one effective ruleset.
/// Org rules are listed first; evaluation still sorts by `priority` desc.
pub fn merge_policy_bundles(org: &PolicyBundle, network: &PolicyBundle) -> PolicyBundle {
    let mut rules = Vec::with_capacity(org.rules.len() + network.rules.len());
    rules.extend(org.rules.iter().cloned());
    rules.extend(network.rules.iter().cloned());

    let mut ssh_rules = Vec::with_capacity(org.ssh_rules.len() + network.ssh_rules.len());
    ssh_rules.extend(org.ssh_rules.iter().cloned());
    ssh_rules.extend(network.ssh_rules.iter().cloned());

    let mut postures = org.postures.clone();
    for (k, v) in &network.postures {
        postures.insert(k.clone(), v.clone());
    }

    let default_src_posture = if !network.default_src_posture.is_empty() {
        network.default_src_posture.clone()
    } else {
        org.default_src_posture.clone()
    };

    PolicyBundle {
        rules,
        ssh_rules,
        version: org.version.max(network.version),
        signature: String::new(),
        postures,
        default_src_posture,
        posture_enforcement: network
            .posture_enforcement
            .clone()
            .or_else(|| org.posture_enforcement.clone()),
    }
}

/// Canonical bytes signed by the control plane for a policy bundle.
pub fn policy_bundle_sign_bytes(bundle: &PolicyBundle) -> Result<Vec<u8>, serde_json::Error> {
    serde_json::to_vec(&(&bundle.rules, &bundle.ssh_rules, bundle.version))
}

/// Verify Ed25519 signature on a policy bundle. Empty signature is allowed only
/// when both rule lists are empty (open default). On failure keep last-good.
pub fn verify_policy_bundle_signature(
    bundle: &PolicyBundle,
    verifying_key: &ed25519_dalek::VerifyingKey,
) -> Result<(), crate::ProtocolError> {
    use base64::Engine;
    use ed25519_dalek::Verifier;

    if bundle.signature.is_empty() {
        if bundle.rules.is_empty() && bundle.ssh_rules.is_empty() {
            return Ok(());
        }
        return Err(crate::ProtocolError::BadSignature);
    }

    let sign_bytes =
        policy_bundle_sign_bytes(bundle).map_err(|_| crate::ProtocolError::BadSignature)?;
    let sig_bytes = base64::engine::general_purpose::STANDARD
        .decode(bundle.signature.as_bytes())
        .map_err(|_| crate::ProtocolError::BadSignature)?;
    let sig_arr: [u8; 64] = sig_bytes
        .as_slice()
        .try_into()
        .map_err(|_| crate::ProtocolError::BadSignature)?;
    let sig = ed25519_dalek::Signature::from_bytes(&sig_arr);
    verifying_key
        .verify(&sign_bytes, &sig)
        .map_err(|_| crate::ProtocolError::BadSignature)
}

/// Content hash for drift detection (blake3 hex of canonical IR JSON).
pub fn policy_content_hash(canonical_ir_json: &[u8]) -> String {
    hex::encode(blake3::hash(canonical_ir_json).as_bytes())
}

pub fn evaluate(bundle: &PolicyBundle, ctx: &EvalCtx<'_>, direction: Direction) -> Action {
    // Mesh ICMP (OS ping, PMTU) must work out of the box. TCP/UDP-only ACLs with
    // implicit deny used to black-hole ping while `tunnet ping` (QUIC) still worked.
    if ctx.protocol == Protocol::Icmp {
        return Action::Allow;
    }
    evaluate_rules(
        &bundle.rules,
        |r, dir| rule_matches_v4(r, ctx, dir),
        direction,
    )
}

/// IPv6 ACL: empty rule set = allow (open); non-empty with no match = deny.
pub fn evaluate_ipv6(
    org_bundle: &PolicyBundle,
    network_bundles: &[PolicyBundle],
    ctx: &Ipv6EvalCtx<'_>,
    direction: Direction,
) -> Action {
    let org = evaluate_rules(
        &org_bundle.rules,
        |r, dir| rule_matches_v6(r, ctx, dir),
        direction,
    );
    if org == Action::Allow {
        return Action::Allow;
    }
    for bundle in network_bundles {
        let action = evaluate_rules(
            &bundle.rules,
            |r, dir| rule_matches_v6(r, ctx, dir),
            direction,
        );
        if action == Action::Allow {
            return Action::Allow;
        }
    }
    Action::Deny
}

fn evaluate_rules<F>(rules: &[PolicyRule], mut matcher: F, direction: Direction) -> Action
where
    F: FnMut(&PolicyRule, Direction) -> bool,
{
    if rules.is_empty() {
        return Action::Allow;
    }

    let mut sorted: Vec<&PolicyRule> = rules.iter().collect();
    sorted.sort_by_key(|rule| std::cmp::Reverse(rule.priority));

    for r in sorted {
        if !matcher(r, direction) {
            continue;
        }
        if let Some(proto) = r.protocol {
            // protocol checked inside matcher for v4/v6 specific paths
            let _ = proto;
        }
        return r.action;
    }
    Action::Deny
}

fn rule_matches_v4(r: &PolicyRule, ctx: &EvalCtx<'_>, direction: Direction) -> bool {
    let (src_ok, dst_ok) = match direction {
        Direction::Inbound => (
            r.src.matches_endpoint(
                ctx.peer_endpoint_hex,
                ctx.peer_tags,
                ctx.peer_network,
                ctx.peer_ip,
            ),
            r.dst.matches_endpoint(
                ctx.self_endpoint_hex,
                ctx.self_tags,
                ctx.self_network,
                Some(ctx.self_ip),
            ),
        ),
        Direction::Outbound => (
            r.src.matches_endpoint(
                ctx.self_endpoint_hex,
                ctx.self_tags,
                ctx.self_network,
                Some(ctx.self_ip),
            ),
            r.dst.matches_endpoint(
                ctx.peer_endpoint_hex,
                ctx.peer_tags,
                ctx.peer_network,
                ctx.peer_ip,
            ),
        ),
    };
    if !src_ok || !dst_ok {
        return false;
    }
    if !r.src_posture.is_empty() && !ctx.src_posture_ok {
        return false;
    }
    proto_port_ok(r, ctx.protocol, ctx.dst_port)
}

fn rule_matches_v6(r: &PolicyRule, ctx: &Ipv6EvalCtx<'_>, direction: Direction) -> bool {
    let (src_ok, dst_ok) = match direction {
        Direction::Inbound => (
            r.src
                .matches_ipv6_endpoint(ctx.peer_endpoint_hex, ctx.peer_tags, ctx.peer_ipv6),
            r.dst
                .matches_ipv6_endpoint(ctx.self_endpoint_hex, ctx.self_tags, Some(ctx.self_ipv6)),
        ),
        Direction::Outbound => (
            r.src
                .matches_ipv6_endpoint(ctx.self_endpoint_hex, ctx.self_tags, Some(ctx.self_ipv6)),
            r.dst
                .matches_ipv6_endpoint(ctx.peer_endpoint_hex, ctx.peer_tags, ctx.peer_ipv6),
        ),
    };
    if !src_ok || !dst_ok {
        return false;
    }
    if !r.src_posture.is_empty() && !ctx.src_posture_ok {
        return false;
    }
    proto_port_ok(r, ctx.protocol, ctx.dst_port)
}

fn proto_port_ok(r: &PolicyRule, protocol: Protocol, dst_port: Option<u16>) -> bool {
    if let Some(proto) = r.protocol
        && proto != Protocol::Any
        && proto != protocol
    {
        return false;
    }
    // ICMP has no L4 port; port-restricted rules must not silently fail to match
    // when the rule protocol is `any` / unset (caller may still exclude ICMP).
    if protocol == Protocol::Icmp {
        return true;
    }
    if !r.ports.is_empty() {
        match dst_port {
            Some(p) if r.ports.iter().any(|pr| pr.contains(p)) => {}
            _ => return false,
        }
    }
    true
}

#[derive(Debug, Clone, Copy)]
pub enum Direction {
    Inbound,
    Outbound,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::Ipv6Addr;

    #[test]
    fn empty_policy_allows_by_default() {
        let ctx = EvalCtx {
            self_endpoint_hex: "aa",
            self_ip: Ipv4Addr::new(10, 7, 0, 1),
            self_tags: &[],
            self_network: "",
            peer_endpoint_hex: "bb",
            peer_ip: Some(Ipv4Addr::new(10, 7, 0, 2)),
            peer_tags: &[],
            peer_network: "",
            dst_port: Some(80),
            protocol: Protocol::Tcp,
            src_posture_ok: true,
        };
        assert_eq!(
            evaluate(&PolicyBundle::default(), &ctx, Direction::Outbound),
            Action::Allow
        );
    }

    #[test]
    fn icmp_allowed_even_with_tcp_only_rules() {
        let bundle = PolicyBundle {
            version: 1,
            signature: String::new(),
            rules: vec![
                PolicyRule {
                    priority: 100,
                    action: Action::Allow,
                    src: Selector::Any,
                    dst: Selector::Any,
                    protocol: Some(Protocol::Tcp),
                    ports: vec![PortRange { start: 80, end: 80 }],
                    src_posture: vec![],
                },
                PolicyRule {
                    priority: 1,
                    action: Action::Deny,
                    src: Selector::Any,
                    dst: Selector::Any,
                    protocol: None,
                    ports: vec![],
                    src_posture: vec![],
                },
            ],
            ssh_rules: vec![],
            postures: Default::default(),
            default_src_posture: vec![],
            posture_enforcement: None,
        };
        let ctx = EvalCtx {
            self_endpoint_hex: "aa",
            self_ip: Ipv4Addr::new(10, 7, 0, 1),
            self_tags: &[],
            self_network: "",
            peer_endpoint_hex: "bb",
            peer_ip: Some(Ipv4Addr::new(10, 7, 0, 2)),
            peer_tags: &[],
            peer_network: "",
            dst_port: None,
            protocol: Protocol::Icmp,
            src_posture_ok: true,
        };
        assert_eq!(evaluate(&bundle, &ctx, Direction::Outbound), Action::Allow);
        assert_eq!(evaluate(&bundle, &ctx, Direction::Inbound), Action::Allow);
    }

    #[test]
    fn explicit_rules_deny_unmatched() {
        let ctx = EvalCtx {
            self_endpoint_hex: "aa",
            self_ip: Ipv4Addr::new(10, 7, 0, 1),
            self_tags: &[],
            self_network: "",
            peer_endpoint_hex: "bb",
            peer_ip: Some(Ipv4Addr::new(10, 7, 0, 2)),
            peer_tags: &[],
            peer_network: "",
            dst_port: Some(80),
            protocol: Protocol::Tcp,
            src_posture_ok: true,
        };
        let bundle = PolicyBundle {
            rules: vec![PolicyRule {
                src: Selector::Tag("admin".into()),
                dst: Selector::Any,
                action: Action::Allow,
                ports: vec![],
                protocol: None,
                priority: 10,
                src_posture: vec![],
            }],
            ssh_rules: vec![],
            version: 1,
            signature: String::new(),
            postures: HashMap::new(),
            default_src_posture: vec![],
            posture_enforcement: None,
        };
        assert_eq!(evaluate(&bundle, &ctx, Direction::Outbound), Action::Deny);
    }

    #[test]
    fn ipv6_empty_policy_allows_by_default() {
        let ctx = Ipv6EvalCtx {
            self_endpoint_hex: "aa",
            self_ipv6: Ipv6Addr::LOCALHOST,
            self_tags: &[],
            peer_endpoint_hex: "bb",
            peer_ipv6: Some(Ipv6Addr::LOCALHOST),
            peer_tags: &[],
            dst_port: None,
            protocol: Protocol::Any,
            src_posture_ok: true,
        };
        let action = evaluate_ipv6(&PolicyBundle::default(), &[], &ctx, Direction::Outbound);
        assert_eq!(action, Action::Allow);
    }

    #[test]
    fn ssh_tag_rule_accepts_matching_user() {
        let rules = vec![SshPolicyRule {
            src: Selector::Tag("admin".into()),
            dst: Selector::Tag("server".into()),
            action: SshAction::Accept,
            users: vec!["root".into()],
            record: false,
            recorder: None,
            enforce_recorder: false,
            check_period_secs: None,
            priority: 10,
        }];
        let ctx = SshEvalCtx {
            src_endpoint_hex: "aa",
            src_tags: &["admin".into()],
            src_network: "prod",
            dst_endpoint_hex: "bb",
            dst_tags: &["server".into()],
            dst_network: "prod",
            requested_user: "root",
            local_user: "oriel",
        };
        let matched = evaluate_ssh(&rules, &ctx).unwrap();
        assert_eq!(matched.action, SshAction::Accept);
    }

    #[test]
    fn ssh_autogroup_nonroot_rejects_root() {
        let rules = vec![SshPolicyRule {
            src: Selector::Any,
            dst: Selector::Any,
            action: SshAction::Accept,
            users: vec![AUTOGROUP_NONROOT.into()],
            record: false,
            recorder: None,
            enforce_recorder: false,
            check_period_secs: None,
            priority: 1,
        }];
        let ctx = SshEvalCtx {
            src_endpoint_hex: "aa",
            src_tags: &[],
            src_network: "prod",
            dst_endpoint_hex: "bb",
            dst_tags: &[],
            dst_network: "prod",
            requested_user: "root",
            local_user: "oriel",
        };
        assert!(evaluate_ssh(&rules, &ctx).is_none());
    }

    fn sample_rule(tag: &str, priority: i32) -> PolicyRule {
        PolicyRule {
            src: Selector::Tag(tag.into()),
            dst: Selector::Any,
            action: Action::Allow,
            ports: vec![],
            protocol: None,
            priority,
            src_posture: vec![],
        }
    }

    #[test]
    fn merge_policy_bundles_combines_rules_postures_and_max_version() {
        let mut org_postures = HashMap::new();
        org_postures.insert("os".into(), vec!["linux".into()]);
        let mut network_postures = HashMap::new();
        network_postures.insert("disk".into(), vec!["encrypted".into()]);

        let org = PolicyBundle {
            rules: vec![sample_rule("org", 10)],
            ssh_rules: vec![],
            version: 3,
            signature: "org-sig".into(),
            postures: org_postures,
            default_src_posture: vec!["os".into()],
            posture_enforcement: None,
        };
        let network = PolicyBundle {
            rules: vec![sample_rule("net", 20)],
            ssh_rules: vec![],
            version: 7,
            signature: "net-sig".into(),
            postures: network_postures,
            default_src_posture: vec![],
            posture_enforcement: None,
        };

        let merged = merge_policy_bundles(&org, &network);
        assert_eq!(merged.rules.len(), 2);
        assert!(matches!(&merged.rules[0].src, Selector::Tag(t) if t == "org"));
        assert!(matches!(&merged.rules[1].src, Selector::Tag(t) if t == "net"));
        assert_eq!(merged.version, 7);
        assert_eq!(merged.signature, "");
        assert_eq!(merged.postures.len(), 2);
        assert_eq!(
            merged.postures.get("os").unwrap(),
            &vec!["linux".to_string()]
        );
        assert_eq!(
            merged.postures.get("disk").unwrap(),
            &vec!["encrypted".to_string()]
        );
        assert_eq!(merged.default_src_posture, vec!["os".to_string()]);
    }

    #[test]
    fn verify_policy_bundle_signature_round_trip_and_tamper() {
        use base64::Engine;
        use ed25519_dalek::{Signer, SigningKey};

        let signing_key = SigningKey::generate(&mut rand::rng());
        let verifying_key = signing_key.verifying_key();

        let mut bundle = PolicyBundle {
            rules: vec![sample_rule("admin", 5)],
            ssh_rules: vec![],
            version: 2,
            signature: String::new(),
            postures: HashMap::new(),
            default_src_posture: vec![],
            posture_enforcement: None,
        };

        let sign_bytes = policy_bundle_sign_bytes(&bundle).unwrap();
        let sig = signing_key.sign(&sign_bytes);
        bundle.signature = base64::engine::general_purpose::STANDARD.encode(sig.to_bytes());
        assert!(verify_policy_bundle_signature(&bundle, &verifying_key).is_ok());

        bundle.rules[0].priority = 99;
        assert!(matches!(
            verify_policy_bundle_signature(&bundle, &verifying_key),
            Err(crate::ProtocolError::BadSignature)
        ));
    }

    #[test]
    fn verify_empty_signature_only_ok_with_empty_rules() {
        use ed25519_dalek::SigningKey;

        let verifying_key = SigningKey::generate(&mut rand::rng()).verifying_key();

        let empty = PolicyBundle::default();
        assert!(verify_policy_bundle_signature(&empty, &verifying_key).is_ok());

        let nonempty = PolicyBundle {
            rules: vec![sample_rule("x", 1)],
            ssh_rules: vec![],
            version: 1,
            signature: String::new(),
            postures: HashMap::new(),
            default_src_posture: vec![],
            posture_enforcement: None,
        };
        assert!(matches!(
            verify_policy_bundle_signature(&nonempty, &verifying_key),
            Err(crate::ProtocolError::BadSignature)
        ));
    }
}
