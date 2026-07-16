//! Agent ↔ public-relay reverse-tunnel wire protocol (ALPN `tunnet/relay/1`).
//!
//! After the QUIC connection is up, the agent opens a **control** bi-stream and
//! sends [`RelayCtrl::Register`]. The relay replies with [`RelayCtrl::Ok`] or
//! [`RelayCtrl::Error`]. Subsequent bi-streams opened **by the relay** are raw
//! byte splices to the agent's localhost port (one stream per public connection).

use serde::{Deserialize, Serialize};

pub const RELAY_ALPN: &[u8] = crate::RELAY_ALPN;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RelayCtrl {
    /// Agent → relay: claim a subdomain on this connection.
    Register {
        tunnel_id: String,
        subdomain: String,
        auth_token: String,
        local_port: u16,
        protocol: String,
    },
    /// Relay → agent: registration accepted.
    Ok,
    /// Relay → agent: registration rejected.
    Error {
        message: String,
    },
    /// Relay → agent on a data bi-stream: connect to `target_port`
    /// (TCP port mappings). Optional `target_ip` is a mesh IPv4; omit = localhost.
    /// HTTPS streams omit this and let the agent peek.
    Forward {
        target_port: u16,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        target_ip: Option<String>,
    },
    Ping,
    Pong,
}

impl RelayCtrl {
    pub fn to_line(&self) -> anyhow::Result<Vec<u8>> {
        let mut buf = serde_json::to_vec(self)?;
        buf.push(b'\n');
        Ok(buf)
    }

    pub fn from_line(line: &str) -> anyhow::Result<Self> {
        Ok(serde_json::from_str(line.trim())?)
    }
}
