//! mDNS local address lookup for Direct mode.
//!
//! Uses [`iroh_mdns_address_lookup::MdnsAddressLookup`] so peers on the same LAN
//! can establish direct paths without a relay. Membership still gates trust;
//! mDNS only supplies addresses for known endpoint IDs.

use iroh::endpoint::Builder;
use iroh_mdns_address_lookup::MdnsAddressLookup;

/// Attach mDNS address lookup to an endpoint builder when enabled.
pub fn apply_mdns(builder: Builder, enable: bool) -> Builder {
    if enable {
        tracing::info!("mDNS local address lookup enabled");
        builder.address_lookup(MdnsAddressLookup::builder())
    } else {
        tracing::info!("mDNS local address lookup disabled");
        builder
    }
}
