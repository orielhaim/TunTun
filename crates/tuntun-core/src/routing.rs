use std::net::Ipv4Addr;
use std::sync::Arc;

use arc_swap::ArcSwap;
use iroh::EndpointId;
use tuntun_common::PeerEntry;

pub struct PeerInfo {
    pub endpoint: EndpointId,
    pub endpoint_hex: String,
    pub hostname: String,
    pub ip: Ipv4Addr,
    pub tags: Vec<String>,
}

pub struct Tables {
    pub by_ip: std::collections::HashMap<Ipv4Addr, Arc<PeerInfo>>,
    pub by_endpoint: std::collections::HashMap<String, Arc<PeerInfo>>,
    pub by_hostname: std::collections::HashMap<String, Arc<PeerInfo>>,
    pub version: u64,
}

#[derive(Clone)]
pub struct RoutingTable {
    inner: Arc<ArcSwap<Tables>>,
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
                version: 0,
            })),
        }
    }

    pub fn lookup_ip(&self, ip: &Ipv4Addr) -> Option<Arc<PeerInfo>> {
        self.inner.load().by_ip.get(ip).cloned()
    }

    pub fn lookup_endpoint(&self, hex: &str) -> Option<Arc<PeerInfo>> {
        self.inner.load().by_endpoint.get(hex).cloned()
    }

    pub fn lookup_hostname(&self, host: &str) -> Option<Arc<PeerInfo>> {
        self.inner.load().by_hostname.get(host).cloned()
    }

    pub fn peers(&self) -> Vec<Arc<PeerInfo>> {
        self.inner.load().by_endpoint.values().cloned().collect()
    }

    pub fn version(&self) -> u64 {
        self.inner.load().version
    }

    pub fn replace(&self, peers: &[PeerEntry], version: u64) {
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
                by_hostname.insert(p.hostname.clone(), info);
            }
        }
        self.inner.store(Arc::new(Tables {
            by_ip,
            by_endpoint,
            by_hostname,
            version,
        }));
    }
}
