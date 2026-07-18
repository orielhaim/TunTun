use std::collections::HashSet;

use crate::ir::PolicyDocument;
use crate::selector;

#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<ValidationIssue>,
    pub warnings: Vec<ValidationIssue>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct ValidationIssue {
    pub path: Option<String>,
    pub message: String,
}

pub fn validate(doc: &PolicyDocument) -> ValidationResult {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    let user_groups: HashSet<_> = doc.user_groups.iter().map(|g| g.name.as_str()).collect();
    let device_groups: HashSet<_> = doc.device_groups.iter().map(|g| g.name.as_str()).collect();
    let tags: HashSet<_> = doc.tags.iter().map(|t| t.name.as_str()).collect();
    let host_aliases: HashSet<_> = doc.host_aliases.iter().map(|h| h.name.as_str()).collect();
    let ip_sets: HashSet<_> = doc.ip_sets.iter().map(|s| s.name.as_str()).collect();
    let postures: HashSet<_> = doc.postures.iter().map(|p| p.name.as_str()).collect();

    check_unique(
        &doc.user_groups
            .iter()
            .map(|g| g.name.as_str())
            .collect::<Vec<_>>(),
        "user_groups",
        &mut errors,
    );
    check_unique(
        &doc.device_groups
            .iter()
            .map(|g| g.name.as_str())
            .collect::<Vec<_>>(),
        "device_groups",
        &mut errors,
    );
    check_unique(
        &doc.acls.iter().map(|a| a.key()).collect::<Vec<_>>(),
        "acls",
        &mut errors,
    );

    for acl in &doc.acls {
        if acl.action != "allow" && acl.action != "deny" {
            errors.push(issue(
                Some(format!("acls.{}", acl.name)),
                format!("invalid action '{}', expected allow or deny", acl.action),
            ));
        }
        if acl.src.is_empty() {
            warnings.push(issue(
                Some(format!("acls.{}.src", acl.name)),
                "empty src matches nothing".into(),
            ));
        }
        if acl.dst.is_empty() {
            warnings.push(issue(
                Some(format!("acls.{}.dst", acl.name)),
                "empty dst matches nothing".into(),
            ));
        }
        for sel in acl.src.iter().chain(acl.dst.iter()) {
            check_selector_refs(
                sel,
                &format!("acls.{}", acl.name),
                &SelectorRefSets {
                    user_groups: &user_groups,
                    device_groups: &device_groups,
                    tags: &tags,
                    host_aliases: &host_aliases,
                    ip_sets: &ip_sets,
                },
                &mut errors,
            );
        }
        for p in &acl.posture {
            if !postures.contains(p.as_str()) {
                errors.push(issue(
                    Some(format!("acls.{}.posture", acl.name)),
                    format!("unknown posture '{p}'"),
                ));
            }
        }
        for port in &acl.ports {
            if !is_valid_port_spec(port) {
                errors.push(issue(
                    Some(format!("acls.{}.ports", acl.name)),
                    format!("invalid port spec '{port}'"),
                ));
            }
        }
    }

    for test in &doc.tests {
        if let Err(e) = selector::parse_selector(&test.src) {
            errors.push(issue(
                Some(format!("tests.{}.src", test.name)),
                e.to_string(),
            ));
        }
        for dst in test.accept.iter().chain(test.deny.iter()) {
            if let Err(e) = selector::parse_selector(dst) {
                errors.push(issue(
                    Some(format!("tests.{}.dst", test.name)),
                    e.to_string(),
                ));
            }
        }
    }

    ValidationResult {
        valid: errors.is_empty(),
        errors,
        warnings,
    }
}

fn check_unique(names: &[&str], entity: &str, errors: &mut Vec<ValidationIssue>) {
    let mut seen = HashSet::new();
    for name in names {
        if !seen.insert(*name) {
            errors.push(issue(
                Some(entity.into()),
                format!("duplicate name '{name}'"),
            ));
        }
    }
}

struct SelectorRefSets<'a> {
    user_groups: &'a HashSet<&'a str>,
    device_groups: &'a HashSet<&'a str>,
    tags: &'a HashSet<&'a str>,
    host_aliases: &'a HashSet<&'a str>,
    ip_sets: &'a HashSet<&'a str>,
}

fn check_selector_refs(
    sel: &str,
    path: &str,
    refs: &SelectorRefSets<'_>,
    errors: &mut Vec<ValidationIssue>,
) {
    let parsed = match selector::parse_selector(sel) {
        Ok(p) => p,
        Err(e) => {
            errors.push(issue(Some(path.into()), e.to_string()));
            return;
        }
    };
    match parsed {
        selector::ParsedSelector::UserGroup(name) if !refs.user_groups.contains(name.as_str()) => {
            errors.push(issue(
                Some(path.into()),
                format!("unknown user group '{name}'"),
            ));
        }
        selector::ParsedSelector::DeviceGroup(name)
            if !refs.device_groups.contains(name.as_str()) =>
        {
            errors.push(issue(
                Some(path.into()),
                format!("unknown device group '{name}'"),
            ));
        }
        selector::ParsedSelector::Tag(name) if !refs.tags.contains(name.as_str()) => {
            errors.push(issue(Some(path.into()), format!("unknown tag '{name}'")));
        }
        selector::ParsedSelector::HostAlias(name) if !refs.host_aliases.contains(name.as_str()) => {
            errors.push(issue(
                Some(path.into()),
                format!("unknown host alias '{name}'"),
            ));
        }
        selector::ParsedSelector::IpSet(name) if !refs.ip_sets.contains(name.as_str()) => {
            errors.push(issue(Some(path.into()), format!("unknown ip set '{name}'")));
        }
        _ => {}
    }
}

fn is_valid_port_spec(spec: &str) -> bool {
    if let Ok(p) = spec.parse::<u16>() {
        return p > 0;
    }
    if let Some((a, b)) = spec.split_once('-') {
        return a.parse::<u16>().is_ok() && b.parse::<u16>().is_ok();
    }
    false
}

fn issue(path: Option<String>, message: String) -> ValidationIssue {
    ValidationIssue { path, message }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ir::{AclRule, TagDefinition, UserGroup};

    #[test]
    fn catches_unknown_user_group_reference() {
        let doc = PolicyDocument {
            acls: vec![AclRule {
                name: "r1".into(),
                slug: None,
                action: "allow".into(),
                src: vec!["group:user:missing".into()],
                dst: vec!["*".into()],
                ports: vec![],
                protocol: None,
                priority: 1,
                posture: vec![],
                labels: Default::default(),
                enabled: true,
            }],
            ..Default::default()
        };
        let result = validate(&doc);
        assert!(!result.valid);
        assert!(result.errors.iter().any(|e| e.message.contains("missing")));
    }

    #[test]
    fn valid_document_passes() {
        let doc = PolicyDocument {
            user_groups: vec![UserGroup {
                name: "eng".into(),
                members: vec![],
            }],
            tags: vec![TagDefinition {
                name: "staging".into(),
                owners: vec![],
            }],
            acls: vec![AclRule {
                name: "allow".into(),
                slug: None,
                action: "allow".into(),
                src: vec!["group:user:eng".into()],
                dst: vec!["tag:staging".into()],
                ports: vec!["443".into()],
                protocol: Some("tcp".into()),
                priority: 10,
                posture: vec![],
                labels: Default::default(),
                enabled: true,
            }],
            ..Default::default()
        };
        assert!(validate(&doc).valid);
    }
}
