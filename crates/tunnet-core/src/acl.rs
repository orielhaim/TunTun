use std::net::Ipv4Addr;
use std::sync::Arc;

use arc_swap::ArcSwap;
use tunnet_common::policy::{Action, Direction, EvalCtx, PolicyBundle, Protocol, evaluate};

use crate::routing::{PeerInfo, RoutingTable};

#[derive(Debug, Clone)]
pub struct SelfIdentity {
    pub endpoint_hex: String,
    pub ip: Ipv4Addr,
    pub tags: Vec<String>,
    pub network: String,
}

#[derive(Clone)]
pub struct AclEngine {
    pub self_id: Arc<ArcSwap<SelfIdentity>>,
    pub routes: RoutingTable,
    pub bundle: Arc<ArcSwap<PolicyBundle>>,
    pub stale: Arc<ArcSwap<bool>>,
    /// When false, ACL rules that require source posture do not match.
    pub src_posture_ok: Arc<ArcSwap<bool>>,
}

impl AclEngine {
    pub fn new(self_id: SelfIdentity, routes: RoutingTable, bundle: PolicyBundle) -> Self {
        Self::with_posture_flag(
            self_id,
            routes,
            bundle,
            Arc::new(ArcSwap::from_pointee(true)),
        )
    }

    pub fn with_posture_flag(
        self_id: SelfIdentity,
        routes: RoutingTable,
        bundle: PolicyBundle,
        src_posture_ok: Arc<ArcSwap<bool>>,
    ) -> Self {
        Self {
            self_id: Arc::new(ArcSwap::from_pointee(self_id)),
            routes,
            bundle: Arc::new(ArcSwap::from_pointee(bundle)),
            stale: Arc::new(ArcSwap::from_pointee(false)),
            src_posture_ok,
        }
    }

    pub fn set_src_posture_ok(&self, ok: bool) {
        self.src_posture_ok.store(Arc::new(ok));
    }

    pub fn replace_bundle(&self, b: PolicyBundle) {
        self.bundle.store(Arc::new(b));
        self.stale.store(Arc::new(false));
    }

    pub fn replace_self_tags(&self, tags: Vec<String>) {
        let current = self.self_id.load();
        if current.tags == tags {
            return;
        }
        self.self_id.store(Arc::new(SelfIdentity {
            endpoint_hex: current.endpoint_hex.clone(),
            ip: current.ip,
            tags,
            network: current.network.clone(),
        }));
    }

    pub fn mark_stale(&self) {
        self.stale.store(Arc::new(true));
    }

    pub fn allow_inbound_peer(&self, peer_endpoint_hex: &str) -> bool {
        self.allow_peer(peer_endpoint_hex, Direction::Inbound)
    }

    pub fn allow_outbound_peer(&self, peer_endpoint_hex: &str) -> bool {
        self.allow_peer(peer_endpoint_hex, Direction::Outbound)
    }

    pub fn allow_peer(&self, peer_endpoint_hex: &str, direction: Direction) -> bool {
        let peer = self.routes.lookup_endpoint(peer_endpoint_hex);
        self.check(
            peer.as_deref(),
            peer_endpoint_hex,
            None,
            None,
            Protocol::Any,
            direction,
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
        let self_id = self.self_id.load();
        let bundle = self.bundle.load();
        let posture_required = !bundle.default_src_posture.is_empty()
            || bundle.rules.iter().any(|r| !r.src_posture.is_empty());
        let src_posture_ok = if posture_required {
            **self.src_posture_ok.load()
        } else {
            true
        };
        let ctx = EvalCtx {
            self_endpoint_hex: &self_id.endpoint_hex,
            self_ip: self_id.ip,
            self_tags: &self_id.tags,
            self_network: &self_id.network,
            peer_endpoint_hex: peer_hex,
            peer_ip: peer_ip.or_else(|| peer.map(|p| p.ip)),
            peer_tags: peer.map(|p| p.tags.as_slice()).unwrap_or(&empty_tags),
            peer_network: &self_id.network,
            dst_port,
            protocol: proto,
            src_posture_ok,
        };
        let action = evaluate(&bundle, &ctx, direction);
        match action {
            Action::Allow => true,
            Action::Deny => {
                if **self.stale.load() && bundle.rules.is_empty() {
                    return true;
                }
                false
            }
        }
    }
}
