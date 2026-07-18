use std::collections::HashMap;
use std::net::Ipv4Addr;

use tunnet_common::policy::{
    Action, Direction, EvalCtx, PolicyBundle, PolicyRule, PortRange, Protocol,
};

use crate::ir::PolicyDocument;
use crate::selector::{self, ParsedSelector};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct SimulateResult {
    pub verdict: String,
    pub matched_rules: Vec<String>,
}

pub fn simulate(
    doc: &PolicyDocument,
    src: &str,
    dst: &str,
    port: Option<u16>,
    proto: &str,
) -> SimulateResult {
    let (bundle, rule_names) = compile_acl_bundle(doc);
    let protocol = parse_protocol(proto);
    let src_parsed = selector::parse_selector(src).unwrap_or(ParsedSelector::Any);
    let dst_parsed = selector::parse_selector(dst).unwrap_or(ParsedSelector::Any);

    let self_endpoint = selector::simulation_endpoint(&src_parsed)
        .unwrap_or_else(|| "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".into());
    let peer_endpoint = selector::simulation_endpoint(&dst_parsed)
        .unwrap_or_else(|| "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".into());

    let ctx = EvalCtx {
        self_endpoint_hex: &self_endpoint,
        self_ip: Ipv4Addr::new(10, 0, 0, 1),
        self_tags: &selector::simulation_tags(&src_parsed),
        self_network: "",
        peer_endpoint_hex: &peer_endpoint,
        peer_ip: Some(Ipv4Addr::new(10, 0, 0, 2)),
        peer_tags: &selector::simulation_tags(&dst_parsed),
        peer_network: "",
        dst_port: port,
        protocol,
        src_posture_ok: true,
    };

    let matched = evaluate_with_trace(&bundle.rules, &rule_names, &ctx, Direction::Outbound);
    SimulateResult {
        verdict: match matched.0 {
            Action::Allow => "allow".into(),
            Action::Deny => "deny".into(),
        },
        matched_rules: matched.1,
    }
}

fn evaluate_with_trace(
    rules: &[PolicyRule],
    names: &[String],
    ctx: &EvalCtx<'_>,
    direction: Direction,
) -> (Action, Vec<String>) {
    if rules.is_empty() {
        return (Action::Allow, vec![]);
    }

    let mut indexed: Vec<(usize, &PolicyRule)> = rules.iter().enumerate().collect();
    indexed.sort_by_key(|(_, rule)| std::cmp::Reverse(rule.priority));

    for (idx, rule) in indexed {
        let matches = match direction {
            Direction::Inbound => (
                rule.src.matches_endpoint(
                    ctx.peer_endpoint_hex,
                    ctx.peer_tags,
                    ctx.peer_network,
                    ctx.peer_ip,
                ),
                rule.dst.matches_endpoint(
                    ctx.self_endpoint_hex,
                    ctx.self_tags,
                    ctx.self_network,
                    Some(ctx.self_ip),
                ),
            ),
            Direction::Outbound => (
                rule.src.matches_endpoint(
                    ctx.self_endpoint_hex,
                    ctx.self_tags,
                    ctx.self_network,
                    Some(ctx.self_ip),
                ),
                rule.dst.matches_endpoint(
                    ctx.peer_endpoint_hex,
                    ctx.peer_tags,
                    ctx.peer_network,
                    ctx.peer_ip,
                ),
            ),
        };
        if !matches.0 || !matches.1 {
            continue;
        }
        if !rule.src_posture.is_empty() && !ctx.src_posture_ok {
            continue;
        }
        if let Some(proto) = rule.protocol
            && proto != Protocol::Any
            && proto != ctx.protocol
        {
            continue;
        }
        if !rule.ports.is_empty() {
            match ctx.dst_port {
                Some(p) if rule.ports.iter().any(|pr| pr.contains(p)) => {}
                _ => continue,
            }
        }
        let name = names
            .get(idx)
            .cloned()
            .unwrap_or_else(|| format!("rule-{idx}"));
        return (rule.action, vec![name]);
    }

    (Action::Deny, vec![])
}

pub fn compile_acl_bundle(doc: &PolicyDocument) -> (PolicyBundle, Vec<String>) {
    let mut rules = Vec::new();
    let mut names = Vec::new();
    let postures: HashMap<String, Vec<String>> = doc
        .postures
        .iter()
        .map(|p| (p.name.clone(), p.assertions.clone()))
        .collect();

    for acl in doc.acls.iter().filter(|a| a.enabled) {
        let srcs = if acl.src.is_empty() {
            vec!["*".to_string()]
        } else {
            acl.src.clone()
        };
        let dsts = if acl.dst.is_empty() {
            vec!["*".to_string()]
        } else {
            acl.dst.clone()
        };

        for src in &srcs {
            for dst in &dsts {
                let src_sel = selector::parse_selector(src)
                    .map(|p| selector::to_policy_selector(&p))
                    .unwrap_or(tunnet_common::policy::Selector::Any);
                let dst_sel = selector::parse_selector(dst)
                    .map(|p| selector::to_policy_selector(&p))
                    .unwrap_or(tunnet_common::policy::Selector::Any);

                rules.push(PolicyRule {
                    src: src_sel,
                    dst: dst_sel,
                    action: if acl.action == "deny" {
                        Action::Deny
                    } else {
                        Action::Allow
                    },
                    ports: parse_ports(&acl.ports),
                    protocol: acl.protocol.as_deref().map(parse_protocol),
                    priority: acl.priority,
                    src_posture: acl.posture.clone(),
                });
                names.push(acl.key().to_string());
            }
        }
    }

    (
        PolicyBundle {
            rules,
            ssh_rules: vec![],
            version: 1,
            signature: String::new(),
            postures,
            default_src_posture: vec![],
            posture_enforcement: None,
        },
        names,
    )
}

fn parse_ports(specs: &[String]) -> Vec<PortRange> {
    let mut out = Vec::new();
    for spec in specs {
        if let Ok(p) = spec.parse::<u16>() {
            out.push(PortRange { start: p, end: p });
        } else if let Some((a, b)) = spec.split_once('-')
            && let (Ok(start), Ok(end)) = (a.parse::<u16>(), b.parse::<u16>())
        {
            out.push(PortRange { start, end });
        }
    }
    out
}

fn parse_protocol(proto: &str) -> Protocol {
    match proto.to_ascii_lowercase().as_str() {
        "tcp" => Protocol::Tcp,
        "udp" => Protocol::Udp,
        "icmp" => Protocol::Icmp,
        _ => Protocol::Any,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ir::{AclRule, TagDefinition, UserGroup};

    fn sample_doc() -> PolicyDocument {
        PolicyDocument {
            user_groups: vec![UserGroup {
                name: "eng".into(),
                members: vec![],
            }],
            tags: vec![TagDefinition {
                name: "staging".into(),
                owners: vec![],
            }],
            acls: vec![
                AclRule {
                    name: "allow-eng-staging".into(),
                    slug: None,
                    action: "allow".into(),
                    src: vec!["group:user:eng".into()],
                    dst: vec!["tag:staging".into()],
                    ports: vec!["443".into()],
                    protocol: Some("tcp".into()),
                    priority: 100,
                    posture: vec![],
                    labels: Default::default(),
                    enabled: true,
                },
                AclRule {
                    name: "default-deny".into(),
                    slug: None,
                    action: "deny".into(),
                    src: vec!["*".into()],
                    dst: vec!["*".into()],
                    ports: vec![],
                    protocol: None,
                    priority: 1,
                    posture: vec![],
                    labels: Default::default(),
                    enabled: true,
                },
            ],
            ..Default::default()
        }
    }

    #[test]
    fn simulate_allow_matching_rule() {
        let doc = sample_doc();
        let result = simulate(&doc, "group:user:eng", "tag:staging", Some(443), "tcp");
        assert_eq!(result.verdict, "allow");
        assert_eq!(result.matched_rules, vec!["allow-eng-staging"]);
    }

    #[test]
    fn simulate_deny_when_no_match() {
        let doc = PolicyDocument {
            acls: vec![AclRule {
                name: "deny-all".into(),
                slug: None,
                action: "deny".into(),
                src: vec!["tag:admin".into()],
                dst: vec!["*".into()],
                ports: vec![],
                protocol: None,
                priority: 10,
                posture: vec![],
                labels: Default::default(),
                enabled: true,
            }],
            ..Default::default()
        };
        let result = simulate(&doc, "tag:guest", "tag:staging", Some(443), "tcp");
        assert_eq!(result.verdict, "deny");
    }
}
