//! Contact IDs for 2-peer Direct connect (`tt_` + base58 endpoint public key).

use iroh::EndpointId;

const PREFIX: &str = "tt_";

/// Format a contact ID from an iroh endpoint id.
pub fn contact_id_from_endpoint(id: &EndpointId) -> String {
    format!("{PREFIX}{}", bs58::encode(id.as_bytes()).into_string())
}

/// Format from hex endpoint id string.
pub fn contact_id_from_hex(endpoint_hex: &str) -> anyhow::Result<String> {
    let id: EndpointId = endpoint_hex
        .parse()
        .map_err(|e| anyhow::anyhow!("bad endpoint id: {e}"))?;
    Ok(contact_id_from_endpoint(&id))
}

/// Parse `tt_…` or raw hex endpoint id into EndpointId.
pub fn parse_contact_id(s: &str) -> anyhow::Result<EndpointId> {
    let s = s.trim();
    if let Some(rest) = s.strip_prefix(PREFIX) {
        let bytes = bs58::decode(rest)
            .into_vec()
            .map_err(|e| anyhow::anyhow!("invalid contact id base58: {e}"))?;
        if bytes.len() != 32 {
            anyhow::bail!(
                "invalid contact id length (expected 32 bytes, got {})",
                bytes.len()
            );
        }
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&bytes);
        return EndpointId::from_bytes(&arr)
            .map_err(|e| anyhow::anyhow!("invalid endpoint bytes: {e}"));
    }
    // Allow bare hex for convenience
    s.parse()
        .map_err(|e| anyhow::anyhow!("invalid contact id (want tt_… or hex): {e}"))
}

pub fn is_contact_id(s: &str) -> bool {
    s.starts_with(PREFIX)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        // 32 zero bytes is a valid ed25519 public key shape for tests only if EndpointId accepts it.
        // Use a well-formed random-looking key from hex.
        let hex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let id: EndpointId = hex.parse().expect("endpoint");
        let cid = contact_id_from_endpoint(&id);
        assert!(cid.starts_with("tt_"));
        let back = parse_contact_id(&cid).unwrap();
        assert_eq!(format!("{back}"), format!("{id}"));
    }
}
