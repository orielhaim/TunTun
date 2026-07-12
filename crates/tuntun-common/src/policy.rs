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

/// Signed policy bundle — everything the agent needs to enforce ACLs
/// even when the control plane is offline.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PolicyBundle {
    pub rules: Vec<PolicyRule>,
    pub version: u64,
    /// base64 Ed25519 signature by the control plane's policy key.
    #[serde(default)]
    pub signature: String,
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

/// IPv6 ACL: fail-closed; checks org bundle then each network bundle.
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
    fn ipv6_fail_closed_by_default() {
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
        assert_eq!(action, Action::Deny);
    }
}
