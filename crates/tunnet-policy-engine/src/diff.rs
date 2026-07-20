use crate::ir::PolicyDocument;

#[derive(Debug, Clone, Default, PartialEq, Eq, serde::Serialize)]
pub struct DiffResult {
    pub changes: Vec<DiffChange>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct DiffChange {
    pub kind: DiffKind,
    pub entity: String,
    pub name: String,
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DiffKind {
    Add,
    Change,
    Remove,
}

pub fn diff(a: &PolicyDocument, b: &PolicyDocument) -> DiffResult {
    let mut changes = Vec::new();
    diff_entities("tag", &a.tags, &b.tags, |t| &t.name, &mut changes);
    diff_entities(
        "host_alias",
        &a.host_aliases,
        &b.host_aliases,
        |h| &h.name,
        &mut changes,
    );
    diff_entities("ip_set", &a.ip_sets, &b.ip_sets, |s| &s.name, &mut changes);
    diff_entities("acl", &a.acls, &b.acls, |r| r.key(), &mut changes);
    diff_entities("grant", &a.grants, &b.grants, |g| &g.name, &mut changes);
    diff_entities(
        "ssh_rule",
        &a.ssh_rules,
        &b.ssh_rules,
        |r| &r.name,
        &mut changes,
    );
    diff_entities(
        "posture",
        &a.postures,
        &b.postures,
        |p| &p.name,
        &mut changes,
    );
    diff_entities(
        "auto_approver",
        &a.auto_approvers,
        &b.auto_approvers,
        |a| &a.name,
        &mut changes,
    );
    diff_entities(
        "node_attribute",
        &a.node_attributes,
        &b.node_attributes,
        |n| &n.name,
        &mut changes,
    );
    diff_entities("test", &a.tests, &b.tests, |t| &t.name, &mut changes);
    DiffResult { changes }
}

fn diff_entities<T: serde::Serialize>(
    entity: &str,
    left: &[T],
    right: &[T],
    name_fn: impl Fn(&T) -> &str,
    changes: &mut Vec<DiffChange>,
) {
    use std::collections::HashMap;

    let left_map: HashMap<_, _> = left.iter().map(|item| (name_fn(item), item)).collect();
    let right_map: HashMap<_, _> = right.iter().map(|item| (name_fn(item), item)).collect();

    for (name, item) in &right_map {
        match left_map.get(name) {
            None => changes.push(DiffChange {
                kind: DiffKind::Add,
                entity: entity.into(),
                name: (*name).into(),
                summary: None,
            }),
            Some(old) => {
                let old_json = serde_json::to_value(old).ok();
                let new_json = serde_json::to_value(item).ok();
                if old_json != new_json {
                    changes.push(DiffChange {
                        kind: DiffKind::Change,
                        entity: entity.into(),
                        name: (*name).into(),
                        summary: Some("fields changed".into()),
                    });
                }
            }
        }
    }

    for name in left_map.keys() {
        if !right_map.contains_key(name) {
            changes.push(DiffChange {
                kind: DiffKind::Remove,
                entity: entity.into(),
                name: (*name).into(),
                summary: None,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ir::AclRule;

    fn acl(name: &str, action: &str, priority: i32) -> AclRule {
        AclRule {
            name: name.into(),
            slug: None,
            action: action.into(),
            src: vec!["*".into()],
            dst: vec!["*".into()],
            ports: vec![],
            protocol: None,
            priority,
            posture: vec![],
            labels: Default::default(),
            enabled: true,
        }
    }

    #[test]
    fn diff_detects_acl_add_remove_and_change() {
        let a = PolicyDocument {
            acls: vec![acl("keep", "allow", 10), acl("gone", "allow", 5)],
            ..Default::default()
        };
        let b = PolicyDocument {
            acls: vec![acl("keep", "deny", 10), acl("new", "allow", 20)],
            ..Default::default()
        };

        let result = diff(&a, &b);
        assert!(
            result
                .changes
                .iter()
                .any(|c| { c.kind == DiffKind::Add && c.entity == "acl" && c.name == "new" })
        );
        assert!(
            result
                .changes
                .iter()
                .any(|c| { c.kind == DiffKind::Remove && c.entity == "acl" && c.name == "gone" })
        );
        assert!(result.changes.iter().any(|c| {
            c.kind == DiffKind::Change
                && c.entity == "acl"
                && c.name == "keep"
                && c.summary.as_deref() == Some("fields changed")
        }));
    }
}
