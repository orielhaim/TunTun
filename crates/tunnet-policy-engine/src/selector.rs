use tunnet_common::policy::Selector;

use crate::error::{PolicyError, Result};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParsedSelector {
    Any,
    Endpoint(String),
    Tag(String),
    Cidr(String),
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
    if s.starts_with("group:user:") || s.starts_with("group:device:") {
        return Err(PolicyError::Parse(format!(
            "invalid selector syntax: {s} (group selectors are no longer supported; use tag:)"
        )));
    }
    if let Some(rest) = s.strip_prefix("tag:") {
        return Ok(ParsedSelector::Tag(rest.to_string()));
    }
    if let Some(rest) = s.strip_prefix("user:") {
        return Ok(ParsedSelector::User(rest.to_string()));
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_group_user_selector() {
        let err = parse_selector("group:user:eng").unwrap_err();
        assert!(err.to_string().contains("group:user:eng"));
    }

    #[test]
    fn rejects_group_device_selector() {
        let err = parse_selector("group:device:servers").unwrap_err();
        assert!(err.to_string().contains("group:device:servers"));
    }
}
