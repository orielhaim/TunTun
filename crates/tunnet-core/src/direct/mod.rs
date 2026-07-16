//! Direct mode: P2P mesh without a control plane.
//!
//! Membership is an [iroh-docs](https://github.com/n0-computer/iroh-docs) document
//! (one doc per network). Discovery uses Mainline DHT + invite coordinator dial.
//! Transport auth proves knowledge of the network PSK before app ALPNs are accepted.

pub mod admin;
pub mod antispoof;
pub mod auth;
pub mod connect;
pub mod contact;
pub mod discovery;
pub mod firewall;
pub mod invite;
pub mod ip;
pub mod mdns;
pub mod membership;
pub mod policy_docs;
pub mod sync;

pub use admin::{PendingJoin, load_pending, push_pending, save_pending};
pub use antispoof::{SpoofTracker, source_matches_peer};
pub use auth::{
    AUTH_ALPN, AuthCache, DirectAuthHook, SecretResolver, run_psk_handshake_client,
    run_psk_handshake_server,
};
pub use contact::{contact_id_from_endpoint, contact_id_from_hex, is_contact_id, parse_contact_id};
pub use discovery::{DiscoveryHandle, spawn_discovery, topic_from_name_secret};
pub use firewall::{
    EvalResult, FirewallConfig, FirewallEngine, FirewallRule, FirewallStats, PacketDirection,
    default_firewall, firewall_to_policy,
};
pub use invite::{InviteCode, decode_invite, encode_invite};
pub use ip::{derive_ipv4, direct_cgnat, network_id_from_topic};
pub use mdns::apply_mdns;
pub use membership::{
    DocsBootstrap, DocsMembership, MembershipEntry, load_approved, save_approved,
};
pub use policy_docs::{PendingSuggestion, SuggestedPolicy};

/// ALPNs used by Direct membership (iroh-docs + its gossip transport).
pub const DOCS_ALPN: &[u8] = iroh_docs::ALPN;
pub const GOSSIP_ALPN: &[u8] = iroh_gossip::ALPN;
