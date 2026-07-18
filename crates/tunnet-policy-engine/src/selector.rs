use tunnet_common::policy::Selector;

use crate::error::{PolicyError, Result};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParsedSelector {
    Any,
    Endpoint(String),
    Tag(String),
    Cidr(String),
    UserGroup(String),
    DeviceGroup(String),
    User(String),
    HostAlias(String),
    IpSet(String),
}

pub fn parse_selector(raw: &str) -> Result<ParsedSelector> {
    let s = raw.trim();
    if s.is_empty() {
        return Err(PolicyError::Parse("empty selector".into()));
    }
    if s == "*" {
        return Ok(ParsedSelector::Any);
    }
    if let Some(rest) = s.strip_prefix("tag:") {
        return Ok(ParsedSelector::Tag(rest.to_string()));
    }
    if let Some(rest) = s.strip_prefix("user:") {
        return Ok(ParsedSelector::User(rest.to_string()));
    }
    if let Some(rest) = s.strip_prefix("group:user:") {
        return Ok(ParsedSelector::UserGroup(rest.to_string()));
    }
    if let Some(rest) = s.strip_prefix("group:device:") {
        return Ok(ParsedSelector::DeviceGroup(rest.to_string()));
    }
    if let Some(rest) = s.strip_prefix("host:") {
        return Ok(ParsedSelector::HostAlias(rest.to_string()));
    }
    if let Some(rest) = s.strip_prefix("ipset:") {
        return Ok(ParsedSelector::IpSet(rest.to_string()));
    }
    if s.parse::<ipnet::IpNet>().is_ok() || s.parse::<ipnet::Ipv4Net>().is_ok() {
        return Ok(ParsedSelector::Cidr(s.to_string()));
    }
    if is_endpoint_hex(s) {
        return Ok(ParsedSelector::Endpoint(s.to_string()));
    }
    Err(PolicyError::Parse(format!("invalid selector syntax: {s}")))
}

pub fn to_policy_selector(parsed: &ParsedSelector) -> Selector {
    match parsed {
        ParsedSelector::Any => Selector::Any,
        ParsedSelector::Endpoint(id) => Selector::Endpoint(id.clone()),
        ParsedSelector::Tag(name) => Selector::Tag(name.clone()),
        ParsedSelector::Cidr(cidr) => Selector::Cidr(cidr.clone()),
        ParsedSelector::UserGroup(name) => Selector::UserGroup(name.clone()),
        ParsedSelector::DeviceGroup(name) => Selector::DeviceGroup(name.clone()),
        ParsedSelector::User(id) => Selector::User(id.clone()),
        ParsedSelector::HostAlias(name) => Selector::Tag(format!("host:{name}")),
        ParsedSelector::IpSet(name) => Selector::Tag(format!("ipset:{name}")),
    }
}

pub fn simulation_tags(parsed: &ParsedSelector) -> Vec<String> {
    match parsed {
        ParsedSelector::Any => vec![],
        ParsedSelector::Endpoint(_) => vec![],
        ParsedSelector::Tag(name) => vec![name.clone()],
        ParsedSelector::Cidr(_) => vec![],
        ParsedSelector::UserGroup(name) => vec![format!("ug:{name}"), name.clone()],
        ParsedSelector::DeviceGroup(name) => vec![format!("dg:{name}"), name.clone()],
        ParsedSelector::User(id) => vec![format!("user:{id}"), id.clone()],
        ParsedSelector::HostAlias(name) => vec![format!("host:{name}")],
        ParsedSelector::IpSet(name) => vec![format!("ipset:{name}")],
    }
}

pub fn simulation_endpoint(parsed: &ParsedSelector) -> Option<String> {
    match parsed {
        ParsedSelector::Endpoint(id) => Some(id.clone()),
        _ => None,
    }
}

fn is_endpoint_hex(s: &str) -> bool {
    s.len() >= 16 && s.len() <= 64 && s.chars().all(|c| c.is_ascii_hexdigit())
}
