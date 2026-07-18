use crate::error::{PolicyError, Result};
use crate::ir::PolicyDocument;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    Json,
    Hcl,
    Yaml,
}

impl Format {
    pub fn from_path(path: &str) -> Option<Self> {
        let lower = path.to_ascii_lowercase();
        if lower.ends_with(".json") {
            Some(Self::Json)
        } else if lower.ends_with(".hcl") {
            Some(Self::Hcl)
        } else if lower.ends_with(".yaml") || lower.ends_with(".yml") {
            Some(Self::Yaml)
        } else {
            None
        }
    }
}

pub fn parse(format: Format, content: &str) -> Result<PolicyDocument> {
    match format {
        Format::Json => parse_json(content),
        Format::Hcl => hcl_parser::parse_hcl(content),
        Format::Yaml => parse_yaml(content),
    }
}

fn parse_json(content: &str) -> Result<PolicyDocument> {
    serde_json::from_str(content).map_err(PolicyError::from)
}

fn parse_yaml(content: &str) -> Result<PolicyDocument> {
    yaml_serde::from_str(content).map_err(PolicyError::from)
}

mod hcl_parser {
    use ::hcl::{Body, Expression};
    use serde_json::{Map, Value as JsonValue};

    use super::*;
    use crate::ir::*;

    pub fn parse_hcl(content: &str) -> Result<PolicyDocument> {
        let body: Body = ::hcl::from_str(content)?;
        let mut doc = PolicyDocument::default();

        for attr in body.attributes() {
            merge_root_attribute(&mut doc, attr.key(), attr.expr())?;
        }

        for block in body.blocks() {
            merge_block(&mut doc, block.identifier(), block.labels(), block.body())?;
        }

        Ok(doc)
    }

    fn merge_root_attribute(doc: &mut PolicyDocument, key: &str, expr: &Expression) -> Result<()> {
        let value = expr_to_json(expr)?;
        match key {
            "user_groups" => doc.user_groups.extend(json_to_vec(value)?),
            "device_groups" => doc.device_groups.extend(json_to_vec(value)?),
            "tags" => doc.tags.extend(json_to_vec(value)?),
            "host_aliases" => doc.host_aliases.extend(json_to_vec(value)?),
            "ip_sets" => doc.ip_sets.extend(json_to_vec(value)?),
            "acls" => doc.acls.extend(json_to_vec(value)?),
            "grants" => doc.grants.extend(json_to_vec(value)?),
            "ssh_rules" => doc.ssh_rules.extend(json_to_vec(value)?),
            "postures" => doc.postures.extend(json_to_vec(value)?),
            "auto_approvers" => doc.auto_approvers.extend(json_to_vec(value)?),
            "node_attributes" => doc.node_attributes.extend(json_to_vec(value)?),
            "tests" => doc.tests.extend(json_to_vec(value)?),
            _ => {}
        }
        Ok(())
    }

    fn merge_block(
        doc: &mut PolicyDocument,
        identifier: &str,
        labels: &[::hcl::BlockLabel],
        body: &Body,
    ) -> Result<()> {
        let mut obj = Map::new();
        if let Some(label) = labels.first() {
            obj.insert("name".into(), JsonValue::String(label.as_str().to_string()));
        }
        for attr in body.attributes() {
            obj.insert(attr.key().to_string(), expr_to_json(attr.expr())?);
        }

        let value = JsonValue::Object(obj);
        match identifier {
            "user_group" => doc.user_groups.push(json_to_one(value)?),
            "device_group" => doc.device_groups.push(json_to_one(value)?),
            "tag" => doc.tags.push(json_to_one(value)?),
            "host_alias" => doc.host_aliases.push(json_to_one(value)?),
            "ip_set" => doc.ip_sets.push(json_to_one(value)?),
            "acl" => doc.acls.push(json_to_one(value)?),
            "grant" => doc.grants.push(json_to_one(value)?),
            "ssh_rule" | "ssh" => doc.ssh_rules.push(json_to_one(value)?),
            "posture" => doc.postures.push(json_to_one(value)?),
            "auto_approver" => doc.auto_approvers.push(json_to_one(value)?),
            "node_attribute" => doc.node_attributes.push(json_to_one(value)?),
            "test" => doc.tests.push(json_to_one(value)?),
            _ => {}
        }
        Ok(())
    }

    fn json_to_one<T: serde::de::DeserializeOwned>(value: JsonValue) -> Result<T> {
        serde_json::from_value(value).map_err(|e| PolicyError::Parse(e.to_string()))
    }

    fn json_to_vec<T: serde::de::DeserializeOwned>(value: JsonValue) -> Result<Vec<T>> {
        match value {
            JsonValue::Array(items) => items
                .into_iter()
                .map(json_to_one)
                .collect::<Result<Vec<_>>>(),
            one => Ok(vec![json_to_one(one)?]),
        }
    }

    fn expr_to_json(expr: &Expression) -> Result<JsonValue> {
        match expr {
            Expression::Null => Ok(JsonValue::Null),
            Expression::Bool(b) => Ok(JsonValue::Bool(*b)),
            Expression::Number(n) => {
                if let Some(i) = n.as_i64() {
                    Ok(JsonValue::Number(i.into()))
                } else if let Some(u) = n.as_u64() {
                    Ok(JsonValue::Number(u.into()))
                } else if let Some(f) = n.as_f64()
                    && let Some(n) = serde_json::Number::from_f64(f)
                {
                    Ok(JsonValue::Number(n))
                } else {
                    Ok(JsonValue::String(n.to_string()))
                }
            }
            Expression::String(s) => Ok(JsonValue::String(s.to_string())),
            Expression::Array(items) => Ok(JsonValue::Array(
                items.iter().map(expr_to_json).collect::<Result<_>>()?,
            )),
            Expression::Object(map) => {
                let mut out = Map::new();
                for (k, v) in map {
                    out.insert(k.to_string(), expr_to_json(v)?);
                }
                Ok(JsonValue::Object(out))
            }
            Expression::FuncCall(call) => Ok(JsonValue::String(selector_from_func(call)?)),
            Expression::Parenthesis(inner) => expr_to_json(inner),
            Expression::Conditional(cond) => expr_to_json(&cond.true_expr),
            Expression::TemplateExpr(t) => Ok(JsonValue::String(t.to_string())),
            Expression::Variable(var) => Ok(JsonValue::String(var.to_string())),
            Expression::Traversal(trav) => Ok(JsonValue::String(format!("{trav:?}"))),
            Expression::Operation(_) | Expression::ForExpr(_) => {
                Ok(JsonValue::String(expr.to_string()))
            }
            _ => Ok(JsonValue::String(expr.to_string())),
        }
    }

    fn selector_from_func(call: &::hcl::expr::FuncCall) -> Result<String> {
        let name = call.name.name.as_str();
        let args: Vec<String> = call
            .args
            .iter()
            .map(|e| match e {
                Expression::String(s) => Ok(s.to_string()),
                other => expr_to_json(other).and_then(|v| match v {
                    JsonValue::String(s) => Ok(s),
                    _ => Err(PolicyError::Parse(format!(
                        "expected string argument in {name}()"
                    ))),
                }),
            })
            .collect::<Result<_>>()?;

        let mapped = match name {
            "tag" => format!("tag:{}", args.first().cloned().unwrap_or_default()),
            "user" => format!("user:{}", args.first().cloned().unwrap_or_default()),
            "usergroup" | "user_group" => {
                format!("group:user:{}", args.first().cloned().unwrap_or_default())
            }
            "devicegroup" | "device_group" => {
                format!("group:device:{}", args.first().cloned().unwrap_or_default())
            }
            "cidr" => args.first().cloned().unwrap_or_default(),
            "endpoint" => args.first().cloned().unwrap_or_default(),
            other => format!("{other}({})", args.join(",")),
        };
        Ok(mapped)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_hcl_acl_block() {
        let hcl = r#"
acl "allow-eng" {
  action   = "allow"
  priority = 100
  src      = [tag("engineering")]
  dst      = ["*"]
}
"#;
        let doc = parse(Format::Hcl, hcl).unwrap();
        assert_eq!(doc.acls.len(), 1);
        assert_eq!(doc.acls[0].name, "allow-eng");
        assert_eq!(doc.acls[0].src, vec!["tag:engineering"]);
    }
}
