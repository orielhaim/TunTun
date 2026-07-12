use ed25519_dalek::SigningKey;
use std::path::Path;

pub fn load(policy_key_env: Option<&str>, path: &str) -> anyhow::Result<SigningKey> {
    if let Some(encoded) = policy_key_env.filter(|s| !s.is_empty()) {
        let bytes =
            base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encoded.trim())?;
        if bytes.len() != 32 {
            anyhow::bail!(
                "TUNTUN_POLICY_KEY decodes to {} bytes, expected 32",
                bytes.len()
            );
        }
        let arr: [u8; 32] = bytes.as_slice().try_into().unwrap();
        return Ok(SigningKey::from_bytes(&arr));
    }

    load_or_generate_file(path)
}

fn load_or_generate_file(path: &str) -> anyhow::Result<SigningKey> {
    let p = Path::new(path);
    if p.exists() {
        let bytes = std::fs::read(p)?;
        if bytes.len() != 32 {
            anyhow::bail!(
                "policy key at {} is {} bytes, expected 32",
                path,
                bytes.len()
            );
        }
        let arr: [u8; 32] = bytes.as_slice().try_into().unwrap();
        return Ok(SigningKey::from_bytes(&arr));
    }
    let sk = SigningKey::generate(&mut rand::rng());
    std::fs::write(p, sk.to_bytes())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(p, std::fs::Permissions::from_mode(0o600))?;
    }
    tracing::warn!(
        path,
        "TUNTUN_POLICY_KEY not set; generated local policy key file (not suitable for multi-replica prod)"
    );
    Ok(sk)
}
