use serde_json::{Map, Value};

use tunnet_common::policy::policy_content_hash;

use crate::ir::PolicyDocument;

pub fn content_hash(doc: &PolicyDocument) -> String {
    let json = serde_json::to_value(doc).unwrap_or(Value::Null);
    let canonical = canonicalize(&json);
    let bytes = serde_json::to_vec(&canonical).unwrap_or_default();
    policy_content_hash(&bytes)
}

pub fn fmt_json(doc: &PolicyDocument) -> String {
    let json = serde_json::to_value(doc).unwrap_or(Value::Null);
    let canonical = canonicalize(&json);
    serde_json::to_string_pretty(&canonical).unwrap_or_else(|_| "{}".into())
}

fn canonicalize(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut keys: Vec<_> = map.keys().collect();
            keys.sort();
            let mut out = Map::new();
            for key in keys {
                out.insert(key.clone(), canonicalize(&map[key]));
            }
            Value::Object(out)
        }
        Value::Array(items) => Value::Array(items.iter().map(canonicalize).collect()),
        _ => value.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ir::{AclRule, TagDefinition};

    #[test]
    fn content_hash_is_stable() {
        let doc = PolicyDocument {
            tags: vec![TagDefinition {
                name: "eng".into(),
                owners: vec!["a@x.com".into()],
            }],
            acls: vec![AclRule {
                name: "allow".into(),
                slug: None,
                action: "allow".into(),
                src: vec!["*".into()],
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
        let h1 = content_hash(&doc);
        let h2 = content_hash(&doc);
        assert_eq!(h1, h2);
        assert!(!h1.is_empty());
    }
}
