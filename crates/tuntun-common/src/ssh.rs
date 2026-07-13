//! TunTun SSH wire protocol (ALPN `tuntun/ssh/1`).

use anyhow::{Context, bail};
use serde::{Deserialize, Serialize};

/// ALPN for mesh SSH sessions.
pub const SSH_ALPN: &[u8] = b"tuntun/ssh/1";

pub const SSH_PROTO_VERSION: u8 = 1;

/// In-band control prefix. Escaping: `0xFF 0xFF` = literal `0xFF`.
pub const SSH_CTRL_PREFIX: u8 = 0xFF;
/// Follows [`SSH_CTRL_PREFIX`]: window resize (`width:u16`, `height:u16`).
pub const SSH_CTRL_RESIZE: u8 = 0x01;
/// Follows [`SSH_CTRL_PREFIX`]: literal `0xFF` byte.
pub const SSH_CTRL_LITERAL_FF: u8 = 0xFF;

pub const MAX_SSH_STRING_LEN: usize = 4096;
pub const MAX_SSH_ENV_VARS: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum SshStatus {
    Ok = 0,
    Denied = 1,
    ReauthRequired = 2,
    UserNotFound = 3,
    RecorderUnavailable = 4,
}

impl SshStatus {
    pub fn from_u8(v: u8) -> Option<Self> {
        match v {
            0 => Some(Self::Ok),
            1 => Some(Self::Denied),
            2 => Some(Self::ReauthRequired),
            3 => Some(Self::UserNotFound),
            4 => Some(Self::RecorderUnavailable),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshRequestHeader {
    pub target_user: String,
    pub term_type: String,
    pub width: u16,
    pub height: u16,
    pub env_vars: Vec<(String, String)>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_token: Option<String>,
    /// Non-interactive command; when set, run and exit (no login shell).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    /// Local username on the client (for `autogroup:local`).
    pub local_user: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshResponseHeader {
    pub status: u8,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reauth_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl SshRequestHeader {
    pub fn encode(&self) -> anyhow::Result<Vec<u8>> {
        if self.env_vars.len() > MAX_SSH_ENV_VARS {
            bail!("too many env vars");
        }
        let mut buf = Vec::with_capacity(128);
        buf.push(SSH_PROTO_VERSION);
        put_str(&mut buf, &self.target_user)?;
        put_str(&mut buf, &self.term_type)?;
        put_u16(&mut buf, self.width);
        put_u16(&mut buf, self.height);
        put_u16(&mut buf, self.env_vars.len() as u16);
        for (k, v) in &self.env_vars {
            put_str(&mut buf, k)?;
            put_str(&mut buf, v)?;
        }
        put_opt_str(&mut buf, self.auth_token.as_deref())?;
        put_opt_str(&mut buf, self.command.as_deref())?;
        put_str(&mut buf, &self.local_user)?;
        Ok(buf)
    }

    pub fn decode(mut data: &[u8]) -> anyhow::Result<Self> {
        let version = take_u8(&mut data).context("version")?;
        if version != SSH_PROTO_VERSION {
            bail!("unsupported ssh proto version {version}");
        }
        let target_user = take_str(&mut data)?;
        let term_type = take_str(&mut data)?;
        let width = take_u16(&mut data)?;
        let height = take_u16(&mut data)?;
        let env_count = take_u16(&mut data)? as usize;
        if env_count > MAX_SSH_ENV_VARS {
            bail!("too many env vars ({env_count})");
        }
        let mut env_vars = Vec::with_capacity(env_count);
        for _ in 0..env_count {
            env_vars.push((take_str(&mut data)?, take_str(&mut data)?));
        }
        let auth_token = take_opt_str(&mut data)?;
        let command = take_opt_str(&mut data)?;
        let local_user = take_str(&mut data)?;
        Ok(Self {
            target_user,
            term_type,
            width,
            height,
            env_vars,
            auth_token,
            command,
            local_user,
        })
    }
}

impl SshResponseHeader {
    pub fn encode(&self) -> anyhow::Result<Vec<u8>> {
        let mut buf = Vec::with_capacity(64);
        buf.push(self.status);
        put_opt_str(&mut buf, self.reauth_url.as_deref())?;
        put_opt_str(&mut buf, self.message.as_deref())?;
        Ok(buf)
    }

    pub fn decode(mut data: &[u8]) -> anyhow::Result<Self> {
        let status = take_u8(&mut data).context("status")?;
        let reauth_url = take_opt_str(&mut data)?;
        let message = take_opt_str(&mut data)?;
        Ok(Self {
            status,
            reauth_url,
            message,
        })
    }

    pub fn ok() -> Self {
        Self {
            status: SshStatus::Ok as u8,
            reauth_url: None,
            message: None,
        }
    }

    pub fn denied(message: impl Into<String>) -> Self {
        Self {
            status: SshStatus::Denied as u8,
            reauth_url: None,
            message: Some(message.into()),
        }
    }

    pub fn reauth_required(url: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            status: SshStatus::ReauthRequired as u8,
            reauth_url: Some(url.into()),
            message: Some(message.into()),
        }
    }

    pub fn user_not_found(user: &str) -> Self {
        Self {
            status: SshStatus::UserNotFound as u8,
            reauth_url: None,
            message: Some(format!("user `{user}` not found on this machine")),
        }
    }
}

fn put_u16(buf: &mut Vec<u8>, v: u16) {
    buf.extend_from_slice(&v.to_be_bytes());
}

fn put_str(buf: &mut Vec<u8>, s: &str) -> anyhow::Result<()> {
    if s.len() > MAX_SSH_STRING_LEN {
        bail!("string too long ({})", s.len());
    }
    put_u16(buf, s.len() as u16);
    buf.extend_from_slice(s.as_bytes());
    Ok(())
}

fn put_opt_str(buf: &mut Vec<u8>, s: Option<&str>) -> anyhow::Result<()> {
    match s {
        Some(v) => put_str(buf, v),
        None => {
            put_u16(buf, 0);
            Ok(())
        }
    }
}

fn take_u8(data: &mut &[u8]) -> anyhow::Result<u8> {
    if data.is_empty() {
        bail!("unexpected eof");
    }
    let v = data[0];
    *data = &data[1..];
    Ok(v)
}

fn take_u16(data: &mut &[u8]) -> anyhow::Result<u16> {
    if data.len() < 2 {
        bail!("unexpected eof");
    }
    let v = u16::from_be_bytes([data[0], data[1]]);
    *data = &data[2..];
    Ok(v)
}

fn take_str(data: &mut &[u8]) -> anyhow::Result<String> {
    let len = take_u16(data)? as usize;
    if len > MAX_SSH_STRING_LEN {
        bail!("string too long ({len})");
    }
    if data.len() < len {
        bail!("unexpected eof");
    }
    let s = std::str::from_utf8(&data[..len]).context("utf8")?;
    *data = &data[len..];
    Ok(s.to_string())
}

fn take_opt_str(data: &mut &[u8]) -> anyhow::Result<Option<String>> {
    let s = take_str(data)?;
    if s.is_empty() { Ok(None) } else { Ok(Some(s)) }
}

/// Escape terminal bytes for the SSH data plane (`0xFF` → `0xFF 0xFF`).
pub fn escape_ssh_data(input: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(input.len());
    for &b in input {
        if b == SSH_CTRL_PREFIX {
            out.push(SSH_CTRL_PREFIX);
            out.push(SSH_CTRL_LITERAL_FF);
        } else {
            out.push(b);
        }
    }
    out
}

/// Encode a window-resize control frame.
pub fn encode_resize(width: u16, height: u16) -> [u8; 6] {
    let mut frame = [0u8; 6];
    frame[0] = SSH_CTRL_PREFIX;
    frame[1] = SSH_CTRL_RESIZE;
    frame[2..4].copy_from_slice(&width.to_be_bytes());
    frame[4..6].copy_from_slice(&height.to_be_bytes());
    frame
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_request() {
        let req = SshRequestHeader {
            target_user: "root".into(),
            term_type: "xterm-256color".into(),
            width: 120,
            height: 40,
            env_vars: vec![("LANG".into(), "en_US.UTF-8".into())],
            auth_token: None,
            command: Some("uname -a".into()),
            local_user: "oriel".into(),
        };
        let encoded = req.encode().unwrap();
        let decoded = SshRequestHeader::decode(&encoded).unwrap();
        assert_eq!(decoded.target_user, "root");
        assert_eq!(decoded.command.as_deref(), Some("uname -a"));
        assert_eq!(decoded.env_vars.len(), 1);
    }

    #[test]
    fn roundtrip_response() {
        let resp = SshResponseHeader::denied("nope");
        let encoded = resp.encode().unwrap();
        let decoded = SshResponseHeader::decode(&encoded).unwrap();
        assert_eq!(decoded.status, SshStatus::Denied as u8);
        assert_eq!(decoded.message.as_deref(), Some("nope"));
    }
}
