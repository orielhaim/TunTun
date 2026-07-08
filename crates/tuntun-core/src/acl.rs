use std::net::Ipv4Addr;
use std::sync::Arc;

use arc_swap::ArcSwap;
use tuntun_common::policy::{Action, Direction, EvalCtx, PolicyBundle, Protocol, evaluate};

use crate::routing::{PeerInfo, RoutingTable};

pub struct SelfIdentity {
    pub endpoint_hex: String,
    pub ip: Ipv4Addr,
    pub tags: Vec<String>,
    pub network: String,
}

#[derive(Clone)]
pub struct AclEngine {
    pub self_id: Arc<SelfIdentity>,
    pub routes: RoutingTable,
    pub bundle: Arc<ArcSwap<PolicyBundle>>,
    pub stale: Arc<ArcSwap<bool>>,
}

impl AclEngine {
    pub fn new(self_id: SelfIdentity, routes: RoutingTable, bundle: PolicyBundle) -> Self {
        Self {
            self_id: Arc::new(self_id),
            routes,
            bundle: Arc::new(ArcSwap::from_pointee(bundle)),
            stale: Arc::new(ArcSwap::from_pointee(false)),
        }
    }

    pub fn replace_bundle(&self, b: PolicyBundle) {
        self.bundle.store(Arc::new(b));
        self.stale.store(Arc::new(false));
    }

    pub fn mark_stale(&self) {
        self.stale.store(Arc::new(true));
    }

    pub fn allow_inbound_peer(&self, peer_endpoint_hex: &str) -> bool {
        let peer = self.routes.lookup_endpoint(peer_endpoint_hex);
        self.check(
            peer.as_deref(),
            peer_endpoint_hex,
            None,
            None,
            Protocol::Any,
            Direction::Inbound,
        )
    }

    pub fn allow_packet(
        &self,
        peer_endpoint_hex: &str,
        peer_ip: Option<Ipv4Addr>,
        dst_port: Option<u16>,
        proto: Protocol,
        direction: Direction,
    ) -> bool {
        let peer = self.routes.lookup_endpoint(peer_endpoint_hex);
        self.check(
            peer.as_deref(),
            peer_endpoint_hex,
            peer_ip,
            dst_port,
            proto,
            direction,
        )
    }

    fn check(
        &self,
        peer: Option<&PeerInfo>,
        peer_hex: &str,
        peer_ip: Option<Ipv4Addr>,
        dst_port: Option<u16>,
        proto: Protocol,
        direction: Direction,
    ) -> bool {
        let empty_tags: Vec<String> = Vec::new();
        let ctx = EvalCtx {
            self_endpoint_hex: &self.self_id.endpoint_hex,
            self_ip: self.self_id.ip,
            self_tags: &self.self_id.tags,
            self_network: &self.self_id.network,
            peer_endpoint_hex: peer_hex,
            peer_ip: peer_ip.or_else(|| peer.map(|p| p.ip)),
            peer_tags: peer.map(|p| p.tags.as_slice()).unwrap_or(&empty_tags),
            peer_network: &self.self_id.network,
            dst_port,
            protocol: proto,
        };
        let action = evaluate(&self.bundle.load(), &ctx, direction);
        match action {
            Action::Allow => true,
            Action::Deny => {
                let b = self.bundle.load();
                if **self.stale.load() && b.rules.is_empty() {
                    return true;
                }
                false
            }
        }
    }
}
