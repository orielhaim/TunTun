//! SSH host key load-or-create in the agent state directory.

use std::path::{Path, PathBuf};

use anyhow::Context;
use russh::keys::{Algorithm, PrivateKey};

pub fn host_key_path(state_dir: &Path) -> PathBuf {
    state_dir.join("ssh_host_ed25519_key")
}

pub fn known_hosts_path(state_dir: &Path) -> PathBuf {
    state_dir.join("known_hosts")
}

/// Load an OpenSSH Ed25519 host key from `state_dir`, or generate and persist one.
pub fn load_or_create_host_key(state_dir: &Path) -> anyhow::Result<PrivateKey> {
    let path = host_key_path(state_dir);
    if path.is_file() {
        let key = PrivateKey::read_openssh_file(&path)
            .with_context(|| format!("read host key {}", path.display()))?;
        return Ok(key);
    }
    std::fs::create_dir_all(state_dir)
        .with_context(|| format!("create state dir {}", state_dir.display()))?;
    let key =
        PrivateKey::random(&mut rand::rng(), Algorithm::Ed25519).context("generate host key")?;
    key.write_openssh_file(&path, russh::keys::ssh_key::LineEnding::LF)
        .with_context(|| format!("write host key {}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    tracing::info!(path = %path.display(), "generated SSH host key");
    Ok(key)
}

/// OpenSSH public key line for the local host key (`ssh-ed25519 AAAA...`).
pub fn host_pubkey_openssh(state_dir: &Path) -> anyhow::Result<String> {
    let key = load_or_create_host_key(state_dir)?;
    key.public_key().to_openssh().context("encode host pubkey")
}
