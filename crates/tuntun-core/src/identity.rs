use anyhow::Context;
use ed25519_dalek::SigningKey;
use rand::RngCore;
use std::path::Path;

#[derive(Clone)]
pub struct AgentIdentity {
    pub secret_bytes: [u8; 32],
    pub signing_key: SigningKey,
}

impl AgentIdentity {
    pub fn generate() -> Self {
        let mut b = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut b);
        let sk = SigningKey::from_bytes(&b);
        Self {
            secret_bytes: b,
            signing_key: sk,
        }
    }

    pub fn from_bytes(b: [u8; 32]) -> Self {
        let sk = SigningKey::from_bytes(&b);
        Self {
            secret_bytes: b,
            signing_key: sk,
        }
    }

    pub fn endpoint_id_hex(&self) -> String {
        hex::encode(self.signing_key.verifying_key().to_bytes())
    }

    pub fn load_from(path: &Path) -> anyhow::Result<Self> {
        let bytes = std::fs::read(path).with_context(|| format!("read {}", path.display()))?;
        if bytes.len() != 32 {
            anyhow::bail!(
                "identity key must be exactly 32 bytes (got {})",
                bytes.len()
            );
        }
        let arr: [u8; 32] = bytes.as_slice().try_into().unwrap();
        Ok(Self::from_bytes(arr))
    }

    pub fn save_to(&self, path: &Path) -> anyhow::Result<()> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).ok();
        }
        std::fs::write(path, self.secret_bytes)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
        }
        Ok(())
    }
}
