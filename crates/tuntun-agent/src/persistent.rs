//! On-disk agent state: identity key, enrollment metadata, cached snapshot.
//!
//! Layout (Linux/macOS):
//!   $XDG_STATE_HOME/tuntun/  or  ~/.local/state/tuntun/  or  /var/lib/tuntun/
//!     agent.key           # 32 raw Ed25519 secret bytes, 0600
//!     state.json          # non-secret metadata
//!     routing_cache.json  # last snapshot, used as fallback on startup

use std::path::{Path, PathBuf};

use anyhow::Context;
use chrono::{DateTime, Utc};
use ed25519_dalek::SigningKey;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub struct StatePaths {
    pub dir: PathBuf,
}

impl StatePaths {
    pub fn resolve(explicit: Option<&str>) -> Self {
        if let Some(p) = explicit {
            return Self {
                dir: PathBuf::from(p),
            };
        }
        #[cfg(unix)]
        {
            if let Ok(xdg) = std::env::var("XDG_STATE_HOME") {
                return Self {
                    dir: PathBuf::from(xdg).join("tuntun"),
                };
            }
            if let Ok(home) = std::env::var("HOME") {
                return Self {
                    dir: PathBuf::from(home).join(".local/state/tuntun"),
                };
            }
        }
        #[cfg(windows)]
        {
            if let Ok(appdata) = std::env::var("LOCALAPPDATA") {
                return Self {
                    dir: PathBuf::from(appdata).join("tuntun"),
                };
            }
        }
        Self {
            dir: PathBuf::from("./tuntun-state"),
        }
    }

    pub fn key_file(&self) -> PathBuf {
        self.dir.join("agent.key")
    }
    pub fn state_file(&self) -> PathBuf {
        self.dir.join("state.json")
    }
    pub fn cache_file(&self) -> PathBuf {
        self.dir.join("routing_cache.json")
    }
}

/// Agent's Ed25519 identity. `secret_bytes` is what iroh needs as `SecretKey`.
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

    pub fn endpoint_id_hex(&self) -> String {
        hex::encode(self.signing_key.verifying_key().to_bytes())
    }

    pub fn save(&self, paths: &StatePaths) -> anyhow::Result<()> {
        std::fs::create_dir_all(&paths.dir)?;
        write_secret_file(&paths.key_file(), &self.secret_bytes)
    }

    pub fn load(paths: &StatePaths) -> anyhow::Result<Self> {
        let bytes = std::fs::read(paths.key_file())
            .with_context(|| format!("read {}", paths.key_file().display()))?;
        if bytes.len() != 32 {
            anyhow::bail!("agent.key must be exactly 32 bytes (got {})", bytes.len());
        }
        let arr: [u8; 32] = bytes.as_slice().try_into().unwrap();
        Ok(Self {
            secret_bytes: arr,
            signing_key: SigningKey::from_bytes(&arr),
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedState {
    pub control_url: String,
    pub network_name: String,
    pub network_id: Uuid,
    pub organization_id: String,
    pub enrolled_at: DateTime<Utc>,
}

impl PersistedState {
    pub fn save(&self, paths: &StatePaths) -> anyhow::Result<()> {
        let json = serde_json::to_vec_pretty(self)?;
        std::fs::write(paths.state_file(), json)?;
        Ok(())
    }
    pub fn load(paths: &StatePaths) -> anyhow::Result<Self> {
        let s = std::fs::read(paths.state_file())
            .with_context(|| format!("read {}", paths.state_file().display()))?;
        Ok(serde_json::from_slice(&s)?)
    }
}

pub fn save_snapshot_cache(
    paths: &StatePaths,
    snap: &tuntun_common::EndpointSnapshot,
) -> anyhow::Result<()> {
    let json = serde_json::to_vec(snap)?;
    std::fs::write(paths.cache_file(), json)?;
    Ok(())
}

pub fn load_snapshot_cache(paths: &StatePaths) -> Option<tuntun_common::EndpointSnapshot> {
    let s = std::fs::read(paths.cache_file()).ok()?;
    serde_json::from_slice(&s).ok()
}

fn write_secret_file(path: &Path, bytes: &[u8]) -> anyhow::Result<()> {
    std::fs::write(path, bytes)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
    }
    // On Windows, DPAPI encryption would be the right tool; kept as TODO.
    Ok(())
}
