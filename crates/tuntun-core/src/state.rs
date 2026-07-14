use std::net::Ipv4Addr;
use std::path::PathBuf;

use anyhow::Context;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone)]
pub struct StatePaths {
    pub dir: PathBuf,
}

impl StatePaths {
    pub fn system_dir() -> PathBuf {
        #[cfg(unix)]
        {
            PathBuf::from("/var/lib/tuntun")
        }
        #[cfg(windows)]
        {
            let base = std::env::var("PROGRAMDATA").unwrap_or_else(|_| r"C:\ProgramData".into());
            PathBuf::from(base).join("tuntun")
        }
        #[cfg(not(any(unix, windows)))]
        {
            PathBuf::from("./tuntun-state")
        }
    }

    pub fn resolve(explicit: Option<&str>) -> Self {
        if let Some(p) = explicit {
            return Self {
                dir: PathBuf::from(p),
            };
        }
        if let Ok(p) = std::env::var("TUNTUN_STATE_DIR")
            && !p.is_empty()
        {
            return Self {
                dir: PathBuf::from(p),
            };
        }

        let system = Self::system_dir();
        if system.join("state.json").is_file() {
            return Self { dir: system };
        }
        if running_as_service_user() {
            return Self { dir: system };
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

    pub fn state_file(&self) -> PathBuf {
        self.dir.join("state.json")
    }
    pub fn cache_file(&self) -> PathBuf {
        self.dir.join("routing_cache.json")
    }
    pub fn membership_file(&self) -> PathBuf {
        self.dir.join("direct_membership.json")
    }
    /// Unified agent configuration (TOML)
    pub fn config_toml_file(&self) -> PathBuf {
        self.dir.join("tuntun.toml")
    }
    /// Encrypted secrets (identity, network PSK, tickets, auth).
    pub fn secrets_file(&self) -> PathBuf {
        self.dir.join("state.enc")
    }
    /// Seal metadata for `state.enc` (tier, wrapped DEK / salt).
    pub fn secrets_meta_file(&self) -> PathBuf {
        self.dir.join("state.enc.meta")
    }
    /// Auto-update pending marker + previous binary live under this dir.
    pub fn update_dir(&self) -> PathBuf {
        self.dir.join("update")
    }
    pub fn update_pending_file(&self) -> PathBuf {
        self.update_dir().join("pending.json")
    }
    pub fn update_previous_bin(&self) -> PathBuf {
        self.update_dir().join("tuntun.prev")
    }
    /// Pending coordinator firewall suggestion.
    pub fn firewall_pending_file(&self) -> PathBuf {
        self.dir.join("firewall_pending.json")
    }
    pub fn invites_file(&self) -> PathBuf {
        self.dir.join("direct_invites.json")
    }
    pub fn pending_file(&self) -> PathBuf {
        self.dir.join("direct_pending.json")
    }

    pub fn ensure(&self) -> anyhow::Result<()> {
        std::fs::create_dir_all(&self.dir)
            .with_context(|| format!("mkdir {}", self.dir.display()))?;
        Ok(())
    }

    pub fn clone_paths(&self) -> StatePaths {
        StatePaths {
            dir: self.dir.clone(),
        }
    }
}

fn running_as_service_user() -> bool {
    #[cfg(unix)]
    {
        if std::env::var("USER").ok().as_deref() == Some("root") {
            return true;
        }
        if std::env::var("HOME").ok().as_deref() == Some("/root") {
            return true;
        }
        // systemd sets this when StateDirectory= is used.
        if std::env::var("STATE_DIRECTORY").is_ok() {
            return true;
        }
    }
    #[cfg(windows)]
    {
        if std::env::var("USERNAME")
            .ok()
            .is_some_and(|u| u.eq_ignore_ascii_case("SYSTEM"))
        {
            return true;
        }
    }
    false
}

/// Operating mode of this agent for the persisted network.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeMode {
    Managed,
    Direct,
}

/// Managed-mode enrollment state (control plane).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManagedState {
    pub control_url: String,
    pub network_name: String,
    pub network_id: Uuid,
    pub organization_id: String,
    pub enrolled_at: DateTime<Utc>,
}

/// Direct-mode P2P network state (no control plane).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectState {
    pub network_name: String,
    /// Hex-encoded 32-byte network secret (PSK). In-memory only - sealed in `state.enc`.
    #[serde(skip)]
    pub network_secret: String,
    /// Hex topic id = blake3(network_name || secret).
    pub topic_hash: String,
    /// Deterministic UUID derived from topic_hash (for IPC / gossip topic helpers).
    pub network_id: Uuid,
    pub coordinator: bool,
    /// Auto-admit valid invite codes without manual approval.
    #[serde(default)]
    pub open: bool,
    pub assigned_ipv4: Ipv4Addr,
    #[serde(default)]
    pub collision_index: u8,
    pub hostname: String,
    /// Optional coordinator endpoint id (hex) known at join time.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub coordinator_endpoint_id: Option<String>,
    /// iroh-docs write ticket. In-memory only - sealed in `state.enc`.
    #[serde(skip)]
    pub doc_ticket: Option<String>,
    /// iroh-docs namespace id (hex). Network document identity.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub namespace_id: Option<String>,
    /// Auto-accept coordinator firewall policy suggestions.
    #[serde(default)]
    pub auto_accept_firewall: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "lowercase")]
pub enum PersistedState {
    Managed(ManagedState),
    Direct(DirectState),
}

impl PersistedState {
    /// Write public (non-secret) fields to `state.json`.
    pub fn save_public(&self, paths: &StatePaths) -> anyhow::Result<()> {
        paths.ensure()?;
        let json = serde_json::to_vec_pretty(self)?;
        std::fs::write(paths.state_file(), json)?;
        Ok(())
    }

    /// Alias: public state only. Secrets go through [`crate::secret_store`].
    pub fn save(&self, paths: &StatePaths) -> anyhow::Result<()> {
        self.save_public(paths)
    }

    pub fn load(paths: &StatePaths) -> anyhow::Result<Self> {
        let s = std::fs::read(paths.state_file())
            .with_context(|| format!("read {}", paths.state_file().display()))?;
        serde_json::from_slice(&s).context("parse state.json")
    }

    /// Load state if present; `Ok(None)` when no state file exists yet.
    pub fn try_load(paths: &StatePaths) -> anyhow::Result<Option<Self>> {
        if !paths.state_file().exists() {
            return Ok(None);
        }
        Ok(Some(Self::load(paths)?))
    }

    /// Merge secrets from `state.enc` into this in-memory state.
    pub fn apply_secrets(&mut self, secrets: &crate::secret_store::AgentSecrets) {
        if let PersistedState::Direct(d) = self {
            if let Some(s) = &secrets.network_secret {
                d.network_secret = s.clone();
            }
            if secrets.doc_ticket.is_some() {
                d.doc_ticket = secrets.doc_ticket.clone();
            }
        }
    }

    pub fn mode(&self) -> NodeMode {
        match self {
            PersistedState::Managed(_) => NodeMode::Managed,
            PersistedState::Direct(_) => NodeMode::Direct,
        }
    }

    pub fn is_managed(&self) -> bool {
        matches!(self, PersistedState::Managed(_))
    }

    pub fn is_direct(&self) -> bool {
        matches!(self, PersistedState::Direct(_))
    }

    pub fn network_name(&self) -> &str {
        match self {
            PersistedState::Managed(m) => &m.network_name,
            PersistedState::Direct(d) => &d.network_name,
        }
    }

    pub fn network_id(&self) -> Uuid {
        match self {
            PersistedState::Managed(m) => m.network_id,
            PersistedState::Direct(d) => d.network_id,
        }
    }

    pub fn as_managed(&self) -> Option<&ManagedState> {
        match self {
            PersistedState::Managed(m) => Some(m),
            _ => None,
        }
    }

    pub fn as_direct(&self) -> Option<&DirectState> {
        match self {
            PersistedState::Direct(d) => Some(d),
            _ => None,
        }
    }

    pub fn require_managed(&self) -> anyhow::Result<&ManagedState> {
        self.as_managed().context(
            "this command requires Managed mode; this agent is in Direct mode \
             (run `tuntun reset --yes` to switch)",
        )
    }

    pub fn require_direct(&self) -> anyhow::Result<&DirectState> {
        self.as_direct().context(
            "this command requires Direct mode; this agent is in Managed mode \
             (run `tuntun reset --yes` to switch)",
        )
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
    /// Persist auth tokens into `state.enc` (creates a sealed vault if needed).
    pub fn save(&self, paths: &StatePaths) -> anyhow::Result<()> {
        crate::secret_store::store_auth(paths, self.clone())
    }

    pub fn load(paths: &StatePaths) -> anyhow::Result<Self> {
        crate::secret_store::load_auth(paths)?.context("no auth tokens in state.enc")
    }

    pub fn clear(paths: &StatePaths) -> anyhow::Result<()> {
        crate::secret_store::clear_auth(paths)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tagged_direct_roundtrip() {
        let s = PersistedState::Direct(DirectState {
            network_name: "home".into(),
            network_secret: "aa".repeat(32),
            topic_hash: "bb".repeat(32),
            network_id: Uuid::nil(),
            coordinator: true,
            open: true,
            assigned_ipv4: "100.64.0.1".parse().unwrap(),
            collision_index: 0,
            hostname: "laptop".into(),
            coordinator_endpoint_id: None,
            doc_ticket: None,
            namespace_id: None,
            auto_accept_firewall: false,
            created_at: Utc::now(),
        });
        let bytes = serde_json::to_vec(&s).unwrap();
        let loaded: PersistedState = serde_json::from_slice(&bytes).unwrap();
        assert!(loaded.is_direct());
        let d = loaded.require_direct().unwrap();
        assert!(
            d.network_secret.is_empty(),
            "secrets must not live in state.json"
        );
        assert!(d.doc_ticket.is_none());
    }

    #[test]
    fn tagged_managed_roundtrip() {
        let s = PersistedState::Managed(ManagedState {
            control_url: "http://localhost:8080".into(),
            network_name: "default".into(),
            network_id: Uuid::nil(),
            organization_id: "org".into(),
            enrolled_at: Utc::now(),
        });
        let bytes = serde_json::to_vec(&s).unwrap();
        let loaded: PersistedState = serde_json::from_slice(&bytes).unwrap();
        assert!(loaded.is_managed());
        assert_eq!(loaded.network_name(), "default");
    }
}
