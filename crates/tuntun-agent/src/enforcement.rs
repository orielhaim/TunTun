//! Per-connection and per-packet ACL enforcement.
//!
//! We resolve the policy once (per snapshot), and expose a cheap
//! `allow_inbound(peer)` for the connection-accept path, and
//! `allow_packet(...)` for the packet-forwarding path.

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
    /// If we haven't been able to refresh the policy in a while, we go
    /// "fail-open on connectivity" for *already established* peers but
    /// still deny anything with an explicit deny rule. See design doc §Guiding Principles.
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

    /// Called when a new incoming iroh connection arrives.
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

    /// Called on the fast path for each packet — try to keep this cheap.
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
                // If we're operating on a stale bundle and there are literally no rules,
                // treat as "no policy configured yet" and permit — otherwise a fresh
                // network with an empty ACL would deadlock itself. The moment the admin
                // adds ANY rule this branch stops applying.
                let b = self.bundle.load();
                if **self.stale.load() && b.rules.is_empty() {
                    return true;
                }
                false
            }
        }
    }
}
