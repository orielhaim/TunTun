//! Decrypt internal-CA leaf private keys (same format as management `internal-ca.ts`).

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use anyhow::{Context, bail};
use base64::Engine;
use sha2::{Digest, Sha256};

/// Resolve the AES-256 key used for CA PEM encryption at rest.
///
/// Matches management: 64-char hex, 32-byte base64, or sha256(`tunnet-dev-ca-key`) fallback.
pub fn resolve_ca_key(raw: Option<&str>) -> [u8; 32] {
    if let Some(raw) = raw {
        if raw.len() == 64 && raw.chars().all(|c| c.is_ascii_hexdigit()) {
            let mut out = [0u8; 32];
            if hex::decode_to_slice(raw, &mut out).is_ok() {
                return out;
            }
        }
        if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(raw)
            && bytes.len() == 32
        {
            let mut out = [0u8; 32];
            out.copy_from_slice(&bytes);
            return out;
        }
        tracing::warn!("TUNNET_CA_ENCRYPTION_KEY invalid - using insecure local-dev CA key");
    } else {
        tracing::warn!("TUNNET_CA_ENCRYPTION_KEY unset - using insecure local-dev CA key");
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&Sha256::digest(b"tunnet-dev-ca-key"));
    out
}

/// Decrypt a blob produced by management `encryptPem`: base64(iv‖tag‖ciphertext).
pub fn decrypt_pem(key: &[u8; 32], blob: &str) -> anyhow::Result<String> {
    let buf = base64::engine::general_purpose::STANDARD
        .decode(blob)
        .context("base64 decode encrypted PEM")?;
    if buf.len() < 28 {
        bail!("encrypted PEM blob too short");
    }
    let iv = &buf[..12];
    let tag = &buf[12..28];
    let ciphertext = &buf[28..];

    let mut sealed = Vec::with_capacity(ciphertext.len() + tag.len());
    sealed.extend_from_slice(ciphertext);
    sealed.extend_from_slice(tag);

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(iv);
    let plain = cipher
        .decrypt(nonce, sealed.as_ref())
        .map_err(|_| anyhow::anyhow!("AES-GCM decrypt failed (wrong CA key?)"))?;
    String::from_utf8(plain).context("decrypted PEM is not utf8")
}
