//! Destination-side Tunnet SSH server (russh on mesh IP + TUN port NAT).

mod host_key;
mod listener;
mod pty;
mod server;
mod sftp;
mod tee;
mod user;

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use parking_lot::Mutex;
use uuid::Uuid;

pub use host_key::{host_pubkey_openssh, known_hosts_path};
pub use listener::spawn_ssh_listener;
pub use server::SshServeDeps;

#[derive(Clone, Default)]
pub struct SshSessionRegistry {
    inner: Arc<Mutex<HashMap<Uuid, ActiveSshSession>>>,
    killed: Arc<Mutex<HashSet<Uuid>>>,
}

struct ActiveSshSession {
    #[allow(dead_code)]
    peer_hex: String,
    #[allow(dead_code)]
    target_user: String,
    killer: Box<dyn portable_pty::ChildKiller + Send + Sync>,
}

impl SshSessionRegistry {
    pub fn insert(
        &self,
        id: Uuid,
        peer_hex: String,
        target_user: String,
        killer: Box<dyn portable_pty::ChildKiller + Send + Sync>,
    ) {
        self.inner.lock().insert(
            id,
            ActiveSshSession {
                peer_hex,
                target_user,
                killer,
            },
        );
    }

    pub fn remove(&self, id: &Uuid) {
        self.inner.lock().remove(id);
    }

    pub fn kill(&self, id: &Uuid) -> bool {
        let mut guard = self.inner.lock();
        if let Some(mut session) = guard.remove(id) {
            self.killed.lock().insert(*id);
            let _ = session.killer.kill();
            true
        } else {
            false
        }
    }

    pub fn take_killed(&self, id: &Uuid) -> bool {
        self.killed.lock().remove(id)
    }
}
