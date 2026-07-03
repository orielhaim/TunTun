//! Enrollment tokens.
//!
//! An admin creates a token bound to (tenant, network) with a short TTL.
//! The agent presents it exactly once on `/v1/enroll`; the row is marked
//! used and the device from that point on authenticates by signature.

use argon2::password_hash::{PasswordHasher, SaltString, rand_core::OsRng};
use argon2::{Argon2, PasswordHash, PasswordVerifier};

/// blake3(token_secret) — used as the DB primary key so leaked backups
/// don't reveal the tokens themselves.
pub fn hash_token(token: &str) -> String {
    hex::encode(blake3::hash(token.as_bytes()).as_bytes())
}

/// For actual admin-user passwords / API keys we still want Argon2.
pub fn hash_password(pw: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon = Argon2::default();
    Ok(argon
        .hash_password(pw.as_bytes(), &salt)
        .map_err(|e| anyhow::anyhow!("argon2: {e}"))?
        .to_string())
}

pub fn verify_password(pw: &str, hash: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(hash) else {
        return false;
    };
    Argon2::default()
        .verify_password(pw.as_bytes(), &parsed)
        .is_ok()
}
