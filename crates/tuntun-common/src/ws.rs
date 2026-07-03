use serde::{Deserialize, Serialize};

use crate::{
    EndpointIdHex, EndpointSnapshot, NetworkMembershipSnapshot, SnapshotDelta, policy::PolicyBundle,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerMsg {
    Snapshot(EndpointSnapshot),
    Delta(SnapshotDelta),
    Policy(PolicyBundle),
    ForceReenroll { reason: String },
    Ping { nonce: u64 },
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
}

// Silence unused import when building with certain feature combos.
#[allow(dead_code)]
fn _touch(_: NetworkMembershipSnapshot) {}
