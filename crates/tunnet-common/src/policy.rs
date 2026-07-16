use serde::{Deserialize, Serialize};
use std::net::{Ipv4Addr, Ipv6Addr};

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "lowercase")]
pub enum Selector {
    Any,
    Endpoint(String),
    Tag(String),
    Network(String),
    Cidr(String),
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
        }
    }
}

pub fn evaluate(bundle: &PolicyBundle, ctx: &EvalCtx<'_>, direction: Direction) -> Action {
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
    proto_port_ok(r, ctx.protocol, ctx.dst_port)
}

fn proto_port_ok(r: &PolicyRule, protocol: Protocol, dst_port: Option<u16>) -> bool {
    if let Some(proto) = r.protocol
        && proto != Protocol::Any
        && proto != protocol
    {
        return false;
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
        };
        assert_eq!(
            evaluate(&PolicyBundle::default(), &ctx, Direction::Outbound),
            Action::Allow
        );
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
        };
        let bundle = PolicyBundle {
            rules: vec![PolicyRule {
                src: Selector::Tag("admin".into()),
                dst: Selector::Any,
                action: Action::Allow,
                ports: vec![],
                protocol: None,
                priority: 10,
            }],
            ssh_rules: vec![],
            version: 1,
            signature: String::new(),
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
}
