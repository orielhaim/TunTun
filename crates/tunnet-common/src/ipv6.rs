//! Tenant-scoped IPv6 addresses derived from endpoint identity.

use std::net::Ipv6Addr;

use crate::ProtocolError;

/// ULA prefix `fd7a:7475:7475::/48` - mnemonic for "tunnet" (ASCII 0x7475).
pub const TENANT_IPV6_PREFIX: [u8; 6] = [0xfd, 0x7a, 0x74, 0x75, 0x74, 0x75];
pub const TENANT_IPV6_PREFIX_LEN: u8 = 48;

const DERIVE_CONTEXT: &str = "tunnet/tenant-ipv6/v1";

/// Derive a stable tenant IPv6 from a 64-char hex `endpoint_id` (Ed25519 pubkey).
pub fn derive_tenant_ipv6(endpoint_id: &str) -> Result<Ipv6Addr, ProtocolError> {
    crate::validate_endpoint_id(endpoint_id)?;
    let pubkey = hex::decode(endpoint_id)
        .map_err(|_| ProtocolError::InvalidEndpointId(endpoint_id.to_string()))?;
    let hash = blake3::derive_key(DERIVE_CONTEXT, &pubkey);
    let iface = u64::from_be_bytes(hash[0..8].try_into().unwrap());
    // RFC 4193: set the universal/local bit in the interface identifier.
    let iface = iface | (1 << 63);
    let octets = [
        TENANT_IPV6_PREFIX[0],
        TENANT_IPV6_PREFIX[1],
        TENANT_IPV6_PREFIX[2],
        TENANT_IPV6_PREFIX[3],
        TENANT_IPV6_PREFIX[4],
        TENANT_IPV6_PREFIX[5],
        0,
        0,
        0,
        0,
        ((iface >> 56) & 0xff) as u8,
        ((iface >> 48) & 0xff) as u8,
        ((iface >> 40) & 0xff) as u8,
        ((iface >> 32) & 0xff) as u8,
        ((iface >> 24) & 0xff) as u8,
        ((iface >> 16) & 0xff) as u8,
    ];
    Ok(Ipv6Addr::from(octets))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_for_same_endpoint() {
        let id = "a".repeat(64);
        let a = derive_tenant_ipv6(&id).unwrap();
        let b = derive_tenant_ipv6(&id).unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn different_endpoints_differ() {
        let a = derive_tenant_ipv6(&"a".repeat(64)).unwrap();
        let b = derive_tenant_ipv6(&"b".repeat(64)).unwrap();
        assert_ne!(a, b);
    }

    #[test]
    fn under_ula_prefix() {
        let id = "c".repeat(64);
        let addr = derive_tenant_ipv6(&id).unwrap();
        let octets = addr.octets();
        assert_eq!(&octets[0..6], &TENANT_IPV6_PREFIX);
    }

    #[test]
    fn rejects_bad_endpoint_id() {
        assert!(derive_tenant_ipv6("short").is_err());
    }
}
