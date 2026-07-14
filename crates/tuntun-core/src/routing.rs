use std::net::Ipv4Addr;
use std::sync::Arc;

use arc_swap::ArcSwap;
use dashmap::DashMap;
use ipnet::Ipv4Net;
use iroh::EndpointId;
use tuntun_common::{
    DeviceProfile, DnsConfig, ExitNodeInfo, HostnameRoute, PeerEntry, SubnetRoute,
};

pub struct PeerInfo {
    pub endpoint: EndpointId,
    pub endpoint_hex: String,
    pub hostname: String,
    pub ip: Ipv4Addr,
    pub tags: Vec<String>,
}

/// Resolved hostname route (exact or wildcard).
pub struct HostnameRouteInfo {
    pub peer: Arc<PeerInfo>,
    pub is_wildcard: bool,
    pub target_ip: Option<Ipv4Addr>,
    /// Stored hostname / suffix (without `*.`).
    pub hostname: String,
}

pub struct Tables {
    pub by_ip: std::collections::HashMap<Ipv4Addr, Arc<PeerInfo>>,
    pub by_endpoint: std::collections::HashMap<String, Arc<PeerInfo>>,
    pub by_hostname: std::collections::HashMap<String, Arc<PeerInfo>>,
    /// Longest-prefix-match candidates, sorted by prefix length descending.
    pub subnets: Vec<(Ipv4Net, Arc<PeerInfo>)>,
    /// CIDRs this node itself advertises (local LAN forwarding).
    pub advertised: Vec<Ipv4Net>,
    /// Exact hostname → gateway.
    pub hostname_exact: std::collections::HashMap<String, Arc<HostnameRouteInfo>>,
    /// Wildcard suffixes, longest first.
    pub hostname_wildcards: Vec<Arc<HostnameRouteInfo>>,
    /// Hostname routes this node itself advertises (local resolve + proxy).
    pub advertised_hostnames: Vec<Arc<HostnameRouteInfo>>,
    /// Synthetic IP → hostname (PeerDNS hostname-route answers).
    pub synthetic_hosts: std::collections::HashMap<Ipv4Addr, String>,
    pub dns_suffix: String,
    pub network_name: String,
    /// PeerDNS magic listener IP (local, not mesh-forwarded).
    pub magic_ip: Ipv4Addr,
    /// Selected exit node peer (when device_profile chooses one).
    pub exit_node: Option<Arc<PeerInfo>>,
    pub version: u64,
}

#[derive(Clone)]
pub struct RoutingTable {
    inner: Arc<ArcSwap<Tables>>,
    /// Synthetic IPs created at DNS resolve time (esp. wildcard hostname routes).
    dynamic_synth: Arc<DashMap<Ipv4Addr, Arc<PeerInfo>>>,
}

impl Default for RoutingTable {
    fn default() -> Self {
        Self::new()
    }
}

impl RoutingTable {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(ArcSwap::from_pointee(Tables {
                by_ip: Default::default(),
                by_endpoint: Default::default(),
                by_hostname: Default::default(),
                subnets: Default::default(),
                advertised: Default::default(),
                hostname_exact: Default::default(),
                hostname_wildcards: Default::default(),
                advertised_hostnames: Default::default(),
                synthetic_hosts: Default::default(),
                dns_suffix: "tuntun".into(),
                network_name: String::new(),
                magic_ip: Ipv4Addr::new(100, 100, 100, 53),
                exit_node: None,
                version: 0,
            })),
            dynamic_synth: Arc::new(DashMap::new()),
        }
    }

    /// Direct peer IP, subnet LPM, then selected exit node for internet.
    pub fn lookup_ip(&self, ip: &Ipv4Addr) -> Option<Arc<PeerInfo>> {
        let tables = self.inner.load();
        if let Some(peer) = tables.by_ip.get(ip).cloned() {
            return Some(peer);
        }
        if let Some(peer) = self.dynamic_synth.get(ip) {
            return Some(peer.clone());
        }
        for (net, peer) in &tables.subnets {
            if net.contains(ip) {
                return Some(peer.clone());
            }
        }
        // Exit node catches remaining (non-mesh) destinations when configured.
        if !is_mesh_or_link_local(ip)
            && let Some(exit) = &tables.exit_node
        {
            return Some(exit.clone());
        }
        None
    }

    pub fn exit_node(&self) -> Option<Arc<PeerInfo>> {
        self.inner.load().exit_node.clone()
    }

    pub fn is_exit_node(&self) -> bool {
        // Advertised default route means we are an exit.
        self.inner
            .load()
            .advertised
            .iter()
            .any(|n| n.prefix_len() == 0)
    }

    pub fn lookup_endpoint(&self, hex: &str) -> Option<Arc<PeerInfo>> {
        self.inner.load().by_endpoint.get(hex).cloned()
    }

    /// Peer hostname (mesh member), then hostname-route exact/wildcard.
    pub fn lookup_hostname(&self, host: &str) -> Option<Arc<PeerInfo>> {
        let host = host.to_ascii_lowercase();
        let tables = self.inner.load();
        if let Some(peer) = tables.by_hostname.get(&host).cloned() {
            return Some(peer);
        }
        self.lookup_hostname_route(&host)
            .map(|info| info.peer.clone())
    }

    pub fn lookup_hostname_route(&self, host: &str) -> Option<Arc<HostnameRouteInfo>> {
        let host = host.to_ascii_lowercase();
        let tables = self.inner.load();
        if let Some(info) = tables.hostname_exact.get(&host).cloned() {
            return Some(info);
        }
        for info in &tables.hostname_wildcards {
            if hostname_matches_wildcard(&host, &info.hostname) {
                return Some(info.clone());
            }
        }
        None
    }

    /// True when this node advertises a subnet containing `ip`.
    pub fn is_advertised_destination(&self, ip: &Ipv4Addr) -> bool {
        self.inner
            .load()
            .advertised
            .iter()
            .any(|net| net.contains(ip))
    }

    /// True when this node is the gateway for a hostname route matching `host`.
    pub fn is_advertised_hostname(&self, host: &str) -> bool {
        let host = host.to_ascii_lowercase();
        let tables = self.inner.load();
        tables.advertised_hostnames.iter().any(|info| {
            if info.is_wildcard {
                hostname_matches_wildcard(&host, &info.hostname)
            } else {
                info.hostname == host
            }
        })
    }

    pub fn advertised_subnets(&self) -> Vec<Ipv4Net> {
        self.inner.load().advertised.clone()
    }

    pub fn peers(&self) -> Vec<Arc<PeerInfo>> {
        self.inner.load().by_endpoint.values().cloned().collect()
    }

    pub fn version(&self) -> u64 {
        self.inner.load().version
    }

    pub fn dns_suffix(&self) -> String {
        self.inner.load().dns_suffix.clone()
    }

    pub fn magic_ip(&self) -> Ipv4Addr {
        self.inner.load().magic_ip
    }

    pub fn is_magic_dns_destination(&self, ip: &Ipv4Addr) -> bool {
        *ip == self.inner.load().magic_ip
    }

    pub fn network_name(&self) -> String {
        self.inner.load().network_name.clone()
    }

    /// Approximate PeerDNS / route cache size for `tuntun dns status`.
    pub fn cached_entry_count(&self) -> usize {
        let tables = self.inner.load();
        tables.by_hostname.len()
            + tables.hostname_exact.len()
            + tables.hostname_wildcards.len()
            + tables.synthetic_hosts.len()
            + self.dynamic_synth.len()
    }

    /// Resolve a PeerDNS name to an IPv4 address (peer mesh IP or synthetic).
    pub fn resolve_dns_a(&self, name: &str) -> Option<Ipv4Addr> {
        let tables = self.inner.load();
        let suffix = format!(".{}", tables.dns_suffix);
        let lower = name.trim_end_matches('.').to_ascii_lowercase();

        let bare = lower
            .strip_suffix(&suffix)
            .unwrap_or(lower.as_str())
            .trim_end_matches('.');

        let network_suffix = if tables.network_name.is_empty() {
            None
        } else {
            Some(format!(".{}", tables.network_name))
        };
        let peer_name = network_suffix
            .as_ref()
            .and_then(|s| bare.strip_suffix(s.as_str()))
            .unwrap_or(bare);

        if let Some(peer) = tables.by_hostname.get(peer_name) {
            return Some(peer.ip);
        }

        for host in [bare, peer_name] {
            if let Some(info) = self.lookup_hostname_route(host) {
                let synth = synthetic_ip_for(host);
                self.dynamic_synth.insert(synth, info.peer.clone());
                return Some(synth);
            }
        }

        None
    }

    /// Reverse lookup: mesh IP → `hostname[.network].suffix`.
    pub fn resolve_dns_ptr(&self, ip: Ipv4Addr) -> Option<String> {
        let tables = self.inner.load();
        let peer = tables.by_ip.get(&ip)?;
        let host = if peer.hostname.is_empty() {
            return None;
        } else {
            peer.hostname.to_ascii_lowercase()
        };
        let fqdn = if tables.network_name.is_empty() {
            format!("{host}.{}", tables.dns_suffix)
        } else {
            format!("{host}.{}.{}", tables.network_name, tables.dns_suffix)
        };
        Some(fqdn)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn replace(
        &self,
        peers: &[PeerEntry],
        subnet_routes: &[SubnetRoute],
        hostname_routes: &[HostnameRoute],
        exit_nodes: &[ExitNodeInfo],
        profile: &DeviceProfile,
        dns: &DnsConfig,
        network_name: &str,
        self_endpoint_id: &str,
        version: u64,
    ) {
        let mut by_ip = std::collections::HashMap::with_capacity(peers.len());
        let mut by_endpoint = std::collections::HashMap::with_capacity(peers.len());
        let mut by_hostname = std::collections::HashMap::with_capacity(peers.len());
        for p in peers {
            let Ok(ep) = p.endpoint_id.parse::<EndpointId>() else {
                tracing::warn!(id = %p.endpoint_id, "skip peer with bad endpoint id");
                continue;
            };
            let info = Arc::new(PeerInfo {
                endpoint: ep,
                endpoint_hex: p.endpoint_id.clone(),
                hostname: p.hostname.clone(),
                ip: p.ip,
                tags: p.tags.clone(),
            });
            by_ip.insert(p.ip, info.clone());
            by_endpoint.insert(p.endpoint_id.clone(), info.clone());
            if !p.hostname.is_empty() {
                by_hostname.insert(p.hostname.to_ascii_lowercase(), info);
            }
        }

        let mut advertised = Vec::new();
        let mut subnets = Vec::new();
        for route in subnet_routes {
            if route.via_endpoint_id == self_endpoint_id {
                advertised.push(route.cidr);
                continue;
            }
            let peer = peer_for_via(&by_endpoint, &route.via_endpoint_id, route.via_ip);
            let Some(peer) = peer else { continue };
            subnets.push((route.cidr, peer));
        }

        // If we ourselves are an exit node, advertise default.
        for exit in exit_nodes {
            if exit.endpoint_id == self_endpoint_id {
                for cidr in &exit.allowed_cidrs {
                    advertised.push(*cidr);
                }
            }
        }

        // Selected exit for this device → install as lowest-priority catch-all via subnets.
        let mut exit_node = None;
        if let Some(exit_id) = &profile.exit_node_endpoint_id
            && let Some(exit) = exit_nodes.iter().find(|e| &e.endpoint_id == exit_id)
        {
            let peer = peer_for_via(&by_endpoint, &exit.endpoint_id, exit.via_ip);
            if let Some(peer) = peer {
                for cidr in &exit.allowed_cidrs {
                    // Don't override more-specific subnet routes.
                    if !subnets.iter().any(|(n, _)| n == cidr) {
                        subnets.push((*cidr, peer.clone()));
                    }
                }
                exit_node = Some(peer);
            }
        }
        subnets.sort_by_key(|subnet| std::cmp::Reverse(subnet.0.prefix_len()));

        let mut hostname_exact = std::collections::HashMap::new();
        let mut hostname_wildcards = Vec::new();
        let mut advertised_hostnames = Vec::new();
        let mut synthetic_hosts = std::collections::HashMap::new();

        for route in hostname_routes {
            let hostname = route.hostname.to_ascii_lowercase();
            let peer = peer_for_via(&by_endpoint, &route.via_endpoint_id, route.via_ip);
            let Some(peer) = peer else { continue };
            let info = Arc::new(HostnameRouteInfo {
                peer: peer.clone(),
                is_wildcard: route.is_wildcard,
                target_ip: route.target_ip,
                hostname: hostname.clone(),
            });
            if route.via_endpoint_id == self_endpoint_id {
                advertised_hostnames.push(info.clone());
                continue;
            }
            if !route.is_wildcard {
                let synth = synthetic_ip_for(&hostname);
                by_ip.insert(synth, peer);
                synthetic_hosts.insert(synth, hostname.clone());
                hostname_exact.insert(hostname, info);
            } else {
                hostname_wildcards.push(info);
            }
        }
        hostname_wildcards.sort_by_key(|route| std::cmp::Reverse(route.hostname.len()));

        self.dynamic_synth.clear();
        self.inner.store(Arc::new(Tables {
            by_ip,
            by_endpoint,
            by_hostname,
            subnets,
            advertised,
            hostname_exact,
            hostname_wildcards,
            advertised_hostnames,
            synthetic_hosts,
            dns_suffix: dns.suffix.clone(),
            network_name: network_name.to_ascii_lowercase(),
            magic_ip: dns.magic_ip,
            exit_node,
            version,
        }));
    }
}

fn is_mesh_or_link_local(ip: &Ipv4Addr) -> bool {
    ip.is_loopback() || ip.is_link_local() || ip.is_broadcast() || ip.is_unspecified()
}

/// Stable synthetic IP in 100.100.0.0/16 derived from hostname.
fn synthetic_ip_for(host: &str) -> Ipv4Addr {
    let mut hash: u32 = 2166136261;
    for b in host.as_bytes() {
        hash ^= u32::from(*b);
        hash = hash.wrapping_mul(16777619);
    }
    let offset = (hash % 65_534) + 1;
    let hi = ((offset >> 8) & 0xff) as u8;
    let low = (offset & 0xff) as u8;
    Ipv4Addr::new(100, 100, hi, low)
}

fn peer_for_via(
    by_endpoint: &std::collections::HashMap<String, Arc<PeerInfo>>,
    via_endpoint_id: &str,
    via_ip: Ipv4Addr,
) -> Option<Arc<PeerInfo>> {
    if let Some(existing) = by_endpoint.get(via_endpoint_id) {
        return Some(existing.clone());
    }
    let Ok(ep) = via_endpoint_id.parse::<EndpointId>() else {
        tracing::warn!(id = %via_endpoint_id, "skip route with bad via endpoint id");
        return None;
    };
    Some(Arc::new(PeerInfo {
        endpoint: ep,
        endpoint_hex: via_endpoint_id.to_string(),
        hostname: String::new(),
        ip: via_ip,
        tags: Vec::new(),
    }))
}

fn hostname_matches_wildcard(host: &str, suffix: &str) -> bool {
    host == suffix
        || host
            .strip_suffix(suffix)
            .is_some_and(|rest| rest.ends_with('.'))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;
    use tuntun_common::SplitTunnelMode;

    fn peer(endpoint: &str, ip: &str, hostname: &str) -> PeerEntry {
        PeerEntry {
            ip: ip.parse().unwrap(),
            endpoint_id: endpoint.to_string(),
            hostname: hostname.to_string(),
            tags: vec![],
        }
    }

    fn dns() -> DnsConfig {
        DnsConfig::default()
    }

    fn profile() -> DeviceProfile {
        DeviceProfile::default()
    }

    #[test]
    fn lookup_prefers_direct_peer_over_subnet() {
        let table = RoutingTable::new();
        let self_id = "a".repeat(64);
        let gateway = "b".repeat(64);
        table.replace(
            &[peer(&gateway, "10.7.0.5", "gw")],
            &[SubnetRoute {
                cidr: Ipv4Net::from_str("10.0.0.0/24").unwrap(),
                via_endpoint_id: gateway.clone(),
                via_ip: "10.7.0.5".parse().unwrap(),
            }],
            &[],
            &[],
            &profile(),
            &dns(),
            "office",
            &self_id,
            1,
        );
        let found = table.lookup_ip(&"10.0.0.100".parse().unwrap()).unwrap();
        assert_eq!(found.endpoint_hex, gateway);
    }

    #[test]
    fn longest_prefix_match() {
        let table = RoutingTable::new();
        let self_id = "a".repeat(64);
        let gw_wide = "b".repeat(64);
        let gw_narrow = "c".repeat(64);
        table.replace(
            &[
                peer(&gw_wide, "10.7.0.5", "wide"),
                peer(&gw_narrow, "10.7.0.6", "narrow"),
            ],
            &[
                SubnetRoute {
                    cidr: Ipv4Net::from_str("10.0.0.0/16").unwrap(),
                    via_endpoint_id: gw_wide.clone(),
                    via_ip: "10.7.0.5".parse().unwrap(),
                },
                SubnetRoute {
                    cidr: Ipv4Net::from_str("10.0.1.0/24").unwrap(),
                    via_endpoint_id: gw_narrow.clone(),
                    via_ip: "10.7.0.6".parse().unwrap(),
                },
            ],
            &[],
            &[],
            &profile(),
            &dns(),
            "office",
            &self_id,
            1,
        );
        let found = table.lookup_ip(&"10.0.1.50".parse().unwrap()).unwrap();
        assert_eq!(found.endpoint_hex, gw_narrow);
        let found = table.lookup_ip(&"10.0.2.50".parse().unwrap()).unwrap();
        assert_eq!(found.endpoint_hex, gw_wide);
    }

    #[test]
    fn advertised_subnets_excluded_from_remote_lookup() {
        let table = RoutingTable::new();
        let self_id = "a".repeat(64);
        table.replace(
            &[],
            &[SubnetRoute {
                cidr: Ipv4Net::from_str("10.0.0.0/24").unwrap(),
                via_endpoint_id: self_id.clone(),
                via_ip: "10.7.0.1".parse().unwrap(),
            }],
            &[],
            &[],
            &profile(),
            &dns(),
            "office",
            &self_id,
            1,
        );
        assert!(table.lookup_ip(&"10.0.0.100".parse().unwrap()).is_none());
        assert!(table.is_advertised_destination(&"10.0.0.100".parse().unwrap()));
    }

    #[test]
    fn hostname_route_exact_and_wildcard() {
        let table = RoutingTable::new();
        let self_id = "a".repeat(64);
        let gw = "b".repeat(64);
        table.replace(
            &[peer(&gw, "10.7.0.5", "gw")],
            &[],
            &[
                HostnameRoute {
                    hostname: "wiki.internal".into(),
                    via_endpoint_id: gw.clone(),
                    via_ip: "10.7.0.5".parse().unwrap(),
                    is_wildcard: false,
                    target_ip: Some("10.0.0.50".parse().unwrap()),
                },
                HostnameRoute {
                    hostname: "internal".into(),
                    via_endpoint_id: gw.clone(),
                    via_ip: "10.7.0.5".parse().unwrap(),
                    is_wildcard: true,
                    target_ip: None,
                },
            ],
            &[],
            &profile(),
            &dns(),
            "office",
            &self_id,
            1,
        );
        let exact = table.lookup_hostname_route("wiki.internal").unwrap();
        assert!(!exact.is_wildcard);
        assert_eq!(exact.target_ip, Some("10.0.0.50".parse().unwrap()));
        let wild = table.lookup_hostname("api.internal").unwrap();
        assert_eq!(wild.endpoint_hex, gw);
        assert!(table.lookup_hostname_route("other.com").is_none());
    }

    #[test]
    fn peer_dns_resolves_peer_and_hostname_route() {
        let table = RoutingTable::new();
        let self_id = "a".repeat(64);
        let gw = "b".repeat(64);
        table.replace(
            &[peer(&gw, "10.7.0.5", "db-server")],
            &[],
            &[HostnameRoute {
                hostname: "wiki.internal".into(),
                via_endpoint_id: gw.clone(),
                via_ip: "10.7.0.5".parse().unwrap(),
                is_wildcard: false,
                target_ip: None,
            }],
            &[],
            &profile(),
            &dns(),
            "office",
            &self_id,
            1,
        );
        assert_eq!(
            table.resolve_dns_a("db-server.tuntun"),
            Some("10.7.0.5".parse().unwrap())
        );
        assert_eq!(
            table.resolve_dns_a("db-server.office.tuntun"),
            Some("10.7.0.5".parse().unwrap())
        );
        let synth = table.resolve_dns_a("wiki.internal.tuntun").unwrap();
        assert_eq!(synth.octets()[0], 100);
        assert_eq!(synth.octets()[1], 100);
        assert_eq!(table.lookup_ip(&synth).unwrap().endpoint_hex, gw);
    }

    #[test]
    fn exit_node_catches_internet_traffic() {
        let table = RoutingTable::new();
        let self_id = "a".repeat(64);
        let exit = "b".repeat(64);
        let mut profile = profile();
        profile.exit_node_endpoint_id = Some(exit.clone());
        profile.split_tunnel_mode = SplitTunnelMode::Exclude;
        table.replace(
            &[peer(&exit, "10.7.0.5", "exit")],
            &[],
            &[],
            &[ExitNodeInfo {
                endpoint_id: exit.clone(),
                via_ip: "10.7.0.5".parse().unwrap(),
                allowed_cidrs: vec![Ipv4Net::from_str("0.0.0.0/0").unwrap()],
            }],
            &profile,
            &dns(),
            "office",
            &self_id,
            1,
        );
        let found = table.lookup_ip(&"8.8.8.8".parse().unwrap()).unwrap();
        assert_eq!(found.endpoint_hex, exit);
    }
}
