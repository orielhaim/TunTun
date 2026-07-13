use std::path::{Path, PathBuf};

use anyhow::Context;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone)]
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
    pub fn auth_file(&self) -> PathBuf {
        self.dir.join("auth.json")
    }

    pub fn ensure(&self) -> anyhow::Result<()> {
        std::fs::create_dir_all(&self.dir)
            .with_context(|| format!("mkdir {}", self.dir.display()))?;
        Ok(())
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
        paths.ensure()?;
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

/// Tokens from `tuntun login` (OAuth PKCE against management).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliAuthTokens {
    pub management_url: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub token_type: String,
    pub scope: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub obtained_at: DateTime<Utc>,
}

impl CliAuthTokens {
    pub fn save(&self, paths: &StatePaths) -> anyhow::Result<()> {
        paths.ensure()?;
        let json = serde_json::to_vec_pretty(self)?;
        std::fs::write(paths.auth_file(), json)?;
        Ok(())
    }

    pub fn load(paths: &StatePaths) -> anyhow::Result<Self> {
        let s = std::fs::read(paths.auth_file())
            .with_context(|| format!("read {}", paths.auth_file().display()))?;
        Ok(serde_json::from_slice(&s)?)
    }

    pub fn clear(paths: &StatePaths) -> anyhow::Result<()> {
        let path = paths.auth_file();
        if path.exists() {
            std::fs::remove_file(&path).with_context(|| format!("remove {}", path.display()))?;
        }
        Ok(())
    }

    pub fn access_token_valid(&self) -> bool {
        match self.expires_at {
            Some(exp) => exp > Utc::now() + chrono::Duration::seconds(30),
            None => true,
        }
    }
}

pub fn save_snapshot_cache(
    paths: &StatePaths,
    snap: &tuntun_common::EndpointSnapshot,
) -> anyhow::Result<()> {
    paths.ensure()?;
    let json = serde_json::to_vec(snap)?;
    std::fs::write(paths.cache_file(), json)?;
    Ok(())
}

pub fn load_snapshot_cache(paths: &StatePaths) -> Option<tuntun_common::EndpointSnapshot> {
    let s = std::fs::read(paths.cache_file()).ok()?;
    serde_json::from_slice(&s).ok()
}

pub fn key_file(paths: &StatePaths) -> &Path {
    // Convenience for load_from / save_to.
    Box::leak(paths.key_file().into_boxed_path())
}
