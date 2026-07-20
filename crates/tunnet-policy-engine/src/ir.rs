use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct PolicyDocument {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<TagDefinition>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub host_aliases: Vec<HostAlias>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ip_sets: Vec<IpSet>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub acls: Vec<AclRule>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub grants: Vec<Grant>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub ssh_rules: Vec<SshRule>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub postures: Vec<PostureDefinition>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub auto_approvers: Vec<AutoApprover>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub node_attributes: Vec<NodeAttribute>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tests: Vec<PolicyTest>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TagDefinition {
    pub name: String,
    #[serde(default)]
    pub owners: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HostAlias {
    pub name: String,
    pub target: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IpSet {
    pub name: String,
    #[serde(default)]
    pub cidrs: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AclRule {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub slug: Option<String>,
    pub action: String,
    #[serde(default)]
    pub src: Vec<String>,
    #[serde(default)]
    pub dst: Vec<String>,
    #[serde(default)]
    pub ports: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub protocol: Option<String>,
    #[serde(default)]
    pub priority: i32,
    #[serde(default)]
    pub posture: Vec<String>,
    #[serde(default)]
    pub labels: HashMap<String, String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Grant {
    pub name: String,
    #[serde(default)]
    pub principals: Vec<String>,
    #[serde(default)]
    pub capability: String,
    #[serde(default)]
    pub ports: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub protocol: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SshRule {
    pub name: String,
    #[serde(default)]
    pub src: Vec<String>,
    #[serde(default)]
    pub dst: Vec<String>,
    pub action: String,
    #[serde(default)]
    pub users: Vec<String>,
    #[serde(default)]
    pub priority: i32,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PostureDefinition {
    pub name: String,
    #[serde(default)]
    pub assertions: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AutoApprover {
    pub name: String,
    #[serde(default)]
    pub route: String,
    #[serde(default)]
    pub principals: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NodeAttribute {
    pub name: String,
    #[serde(default)]
    pub value: String,
    #[serde(default)]
    pub selectors: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PolicyTest {
    pub name: String,
    pub src: String,
    #[serde(default)]
    pub accept: Vec<String>,
    #[serde(default)]
    pub deny: Vec<String>,
}

impl AclRule {
    pub fn key(&self) -> &str {
        self.slug.as_deref().unwrap_or(&self.name)
    }
}
