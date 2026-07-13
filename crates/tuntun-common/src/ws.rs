use serde::{Deserialize, Serialize};

use crate::{
    EndpointIdHex, EndpointSnapshot, NetworkMembershipSnapshot, RedirectRule, SnapshotDelta,
    policy::PolicyBundle,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMsg {
    Snapshot(EndpointSnapshot),
    Delta(SnapshotDelta),
    Policy(PolicyBundle),
    ForceReenroll {
        reason: String,
    },
    Ping {
        nonce: u64,
    },

    /// Dashboard / CP tells agent to start an internal serve.
    StartServe {
        serve_id: String,
        port: u16,
        protocol: String,
        internal_hostname: String,
        /// PEM leaf cert (optional for tcp).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        certificate_pem: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        private_key_pem: Option<String>,
        #[serde(default = "default_all_peers")]
        access_mode: String,
        #[serde(default)]
        allowed_tags: Vec<String>,
        #[serde(default)]
        allowed_endpoint_ids: Vec<String>,
    },
    StopServe {
        serve_id: String,
    },

    /// Dashboard / CP tells agent to open a reverse tunnel to a relay.
    OpenTunnel {
        tunnel_id: String,
        /// iroh endpoint id hex of the relay.
        relay_addr: String,
        subdomain: String,
        public_hostname: String,
        local_port: u16,
        protocol: String,
        auth_token: String,
        #[serde(default)]
        redirect_rules: Vec<RedirectRule>,
    },
    StopTunnel {
        tunnel_id: String,
    },

    /// Dashboard / CP tells destination agent to force-close an SSH session.
    KillSshSession {
        session_id: String,
    },
}

fn default_all_peers() -> String {
    "all_peers".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMsg {
    Hello {
        endpoint_id: EndpointIdHex,
        agent_version: String,
        known_version: u64,
    },
    Heartbeat {
        active_conns: u32,
        bytes_tx: u64,
        bytes_rx: u64,
    },
    Pong {
        nonce: u64,
    },

    ServeReady {
        serve_id: String,
    },
    ServeStopped {
        serve_id: String,
    },
    ServeFailed {
        serve_id: String,
        error: String,
    },
    /// A peer connected to an active serve.
    ServePeerJoined {
        serve_id: String,
        peer_endpoint_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        peer_hostname: Option<String>,
    },
    /// A peer disconnected from a serve (includes final byte counters).
    ServePeerLeft {
        serve_id: String,
        peer_endpoint_id: String,
        bytes_in: u64,
        bytes_out: u64,
    },

    TunnelReady {
        tunnel_id: String,
    },
    TunnelStopped {
        tunnel_id: String,
    },
    TunnelFailed {
        tunnel_id: String,
        error: String,
    },

    /// Destination agent: an SSH session started.
    SshSessionStarted {
        session_id: String,
        src_endpoint_id: EndpointIdHex,
        target_user: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        src_hostname: Option<String>,
        recorded: bool,
    },
    /// Destination agent: an SSH session ended.
    SshSessionEnded {
        session_id: String,
        #[serde(default)]
        status: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        duration_ms: Option<u64>,
    },

    /// Recorder node: a session recording was saved locally (and cast uploaded separately).
    SshRecordingSaved {
        session_id: String,
        recorder_endpoint_id: EndpointIdHex,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        duration_ms: Option<u64>,
        #[serde(default)]
        byte_size: u64,
        #[serde(default)]
        content_sha256: String,
    },
}

// Silence unused import when building with certain feature combos.
#[allow(dead_code)]
fn _touch(_: NetworkMembershipSnapshot) {}
