use crate::error::{PolicyError, Result};
use crate::ir::PolicyDocument;

pub fn merge_documents(docs: &[PolicyDocument]) -> Result<PolicyDocument> {
    let mut out = PolicyDocument::default();
    for doc in docs {
        merge_vec(&mut out.tags, &doc.tags, "tag", |t| &t.name)?;
        merge_vec(
            &mut out.host_aliases,
            &doc.host_aliases,
            "host_alias",
            |h| &h.name,
        )?;
        merge_vec(&mut out.ip_sets, &doc.ip_sets, "ip_set", |s| &s.name)?;
        merge_vec(&mut out.acls, &doc.acls, "acl", |a| a.key())?;
        merge_vec(&mut out.grants, &doc.grants, "grant", |g| &g.name)?;
        merge_vec(&mut out.ssh_rules, &doc.ssh_rules, "ssh_rule", |r| &r.name)?;
        merge_vec(&mut out.postures, &doc.postures, "posture", |p| &p.name)?;
        merge_vec(
            &mut out.auto_approvers,
            &doc.auto_approvers,
            "auto_approver",
            |a| &a.name,
        )?;
        merge_vec(
            &mut out.node_attributes,
            &doc.node_attributes,
            "node_attribute",
            |n| &n.name,
        )?;
        merge_vec(&mut out.tests, &doc.tests, "test", |t| &t.name)?;
    }
    Ok(out)
}

fn merge_vec<T: Clone>(
    dest: &mut Vec<T>,
    src: &[T],
    entity: &str,
    name_fn: impl Fn(&T) -> &str,
) -> Result<()> {
    for item in src {
        let name = name_fn(item);
        if dest.iter().any(|existing| name_fn(existing) == name) {
            return Err(PolicyError::MergeConflict {
                entity: entity.into(),
                name: name.into(),
            });
        }
        dest.push(item.clone());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ir::{AclRule, TagDefinition};

    #[test]
    fn merge_conflict_on_duplicate_tag() {
        let a = PolicyDocument {
            tags: vec![TagDefinition {
                name: "eng".into(),
                owners: vec!["a@x.com".into()],
            }],
            ..Default::default()
        };
        let b = PolicyDocument {
            tags: vec![TagDefinition {
                name: "eng".into(),
                owners: vec!["b@x.com".into()],
            }],
            ..Default::default()
        };
        let err = merge_documents(&[a, b]).unwrap_err();
        assert!(err.to_string().contains("eng"));
    }

    #[test]
    fn merge_distinct_names_ok() {
        let a = PolicyDocument {
            acls: vec![AclRule {
                name: "a".into(),
                slug: None,
                action: "allow".into(),
                src: vec![],
                dst: vec![],
                ports: vec![],
                protocol: None,
                priority: 1,
                posture: vec![],
                labels: Default::default(),
                enabled: true,
            }],
            ..Default::default()
        };
        let b = PolicyDocument {
            acls: vec![AclRule {
                name: "b".into(),
                slug: None,
                action: "deny".into(),
                src: vec![],
                dst: vec![],
                ports: vec![],
                protocol: None,
                priority: 2,
                posture: vec![],
                labels: Default::default(),
                enabled: true,
            }],
            ..Default::default()
        };
        let merged = merge_documents(&[a, b]).unwrap();
        assert_eq!(merged.acls.len(), 2);
    }
}
