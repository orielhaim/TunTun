//! In-memory map of subdomain → live agent reverse-tunnel connection.

use std::sync::Arc;

use dashmap::DashMap;
use iroh::endpoint::Connection;
use parking_lot::Mutex;

#[derive(Clone)]
pub struct TunnelRegistry {
    by_subdomain: Arc<DashMap<String, Arc<TunnelSlot>>>,
}

pub struct TunnelSlot {
    pub tunnel_id: String,
    pub subdomain: String,
    #[allow(dead_code)]
    pub local_port: u16,
    #[allow(dead_code)]
    pub protocol: String,
    pub conn: Mutex<Option<Connection>>,
}

impl TunnelRegistry {
    pub fn new() -> Self {
        Self {
            by_subdomain: Arc::new(DashMap::new()),
        }
    }

    pub fn active_count(&self) -> usize {
        self.by_subdomain
            .iter()
            .filter(|e| e.value().conn.lock().is_some())
            .count()
    }

    pub fn insert(&self, slot: Arc<TunnelSlot>) {
        self.by_subdomain
            .insert(slot.subdomain.to_ascii_lowercase(), slot);
    }

    pub fn get(&self, host: &str) -> Option<Arc<TunnelSlot>> {
        let key = normalize_host(host);
        // Exact subdomain match, or first label of FQDN.
        if let Some(slot) = self.by_subdomain.get(&key) {
            return Some(slot.clone());
        }
        let sub = key.split('.').next().unwrap_or(&key);
        self.by_subdomain.get(sub).map(|s| s.clone())
    }

    pub fn remove_tunnel(&self, tunnel_id: &str) {
        self.by_subdomain
            .retain(|_, slot| slot.tunnel_id != tunnel_id);
    }
}

impl Default for TunnelRegistry {
    fn default() -> Self {
        Self::new()
    }
}

fn normalize_host(host: &str) -> String {
    host.split(':')
        .next()
        .unwrap_or(host)
        .trim()
        .to_ascii_lowercase()
}
