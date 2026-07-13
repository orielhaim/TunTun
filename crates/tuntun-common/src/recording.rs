//! Session recording wire protocol (ALPN `tuntun/recording/1`).
//!
//! After a length-prefixed [`RecordingMeta`] frame, the stream carries raw
//! asciinema v2 cast bytes (NDJSON).

use anyhow::{Context, bail};
use serde::{Deserialize, Serialize};

/// ALPN for SSH session recording streams.
pub const RECORDING_ALPN: &[u8] = b"tuntun/recording/1";

pub const RECORDING_PROTO_VERSION: u8 = 1;
pub const MAX_RECORDING_META_LEN: usize = 64 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingMeta {
    pub session_id: String,
    pub peer_endpoint: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub peer_hostname: Option<String>,
    pub user: String,
    pub machine: String,
    pub network: String,
    pub width: u16,
    pub height: u16,
    #[serde(default)]
    pub term: String,
    #[serde(default)]
    pub shell: String,
}

impl RecordingMeta {
    pub fn encode(&self) -> anyhow::Result<Vec<u8>> {
        let mut body = Vec::new();
        body.push(RECORDING_PROTO_VERSION);
        let json = serde_json::to_vec(self).context("serialize recording meta")?;
        if json.len() > MAX_RECORDING_META_LEN {
            bail!("recording meta too large");
        }
        body.extend_from_slice(&(json.len() as u32).to_be_bytes());
        body.extend_from_slice(&json);
        Ok(body)
    }

    pub fn decode(data: &[u8]) -> anyhow::Result<Self> {
        if data.is_empty() {
            bail!("empty recording meta");
        }
        if data[0] != RECORDING_PROTO_VERSION {
            bail!("unsupported recording proto version {}", data[0]);
        }
        if data.len() < 5 {
            bail!("truncated recording meta");
        }
        let len = u32::from_be_bytes([data[1], data[2], data[3], data[4]]) as usize;
        if len > MAX_RECORDING_META_LEN {
            bail!("recording meta too large ({len})");
        }
        if data.len() < 5 + len {
            bail!("truncated recording meta body");
        }
        serde_json::from_slice(&data[5..5 + len]).context("parse recording meta json")
    }
}

/// Build an asciinema v2 header line (without trailing newline).
pub fn asciinema_header_line(meta: &RecordingMeta, timestamp_unix: i64) -> String {
    let header = serde_json::json!({
        "version": 2,
        "width": meta.width,
        "height": meta.height,
        "timestamp": timestamp_unix,
        "env": {
            "SHELL": if meta.shell.is_empty() { "/bin/bash" } else { &meta.shell },
            "TERM": if meta.term.is_empty() { "xterm-256color" } else { &meta.term },
        },
        "tuntun": {
            "peer": meta.peer_hostname.as_deref().unwrap_or(""),
            "peer_endpoint": meta.peer_endpoint,
            "user": meta.user,
            "machine": meta.machine,
            "network": meta.network,
            "session_id": meta.session_id,
        }
    });
    header.to_string()
}

/// Build an asciinema v2 output event line (without trailing newline).
pub fn asciinema_output_event(time_secs: f64, data: &str) -> String {
    serde_json::json!([time_secs, "o", data]).to_string()
}

/// Build an asciinema v2 resize event line.
pub fn asciinema_resize_event(time_secs: f64, cols: u16, rows: u16) -> String {
    serde_json::json!([time_secs, "r", format!("{cols}x{rows}")]).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_meta() {
        let meta = RecordingMeta {
            session_id: "abc".into(),
            peer_endpoint: "aa".repeat(32),
            peer_hostname: Some("laptop".into()),
            user: "root".into(),
            machine: "db".into(),
            network: "prod".into(),
            width: 120,
            height: 40,
            term: "xterm-256color".into(),
            shell: "/bin/bash".into(),
        };
        let enc = meta.encode().unwrap();
        let dec = RecordingMeta::decode(&enc).unwrap();
        assert_eq!(dec.session_id, "abc");
        assert_eq!(dec.width, 120);
    }
}
