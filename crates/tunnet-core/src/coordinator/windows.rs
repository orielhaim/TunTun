//! Windows named-pipe coordinator (named mutex + `\\.\pipe\tunnet-*`).

use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{Context, bail};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::windows::named_pipe::{ClientOptions, NamedPipeClient, ServerOptions};
use uuid::Uuid;
use windows::Win32::Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0, WAIT_TIMEOUT};
use windows::Win32::System::Threading::{CreateMutexW, WaitForSingleObject};
use windows::core::HSTRING;

use super::{ClientReq, CoordResp, Role, handle_client_rw};
use crate::node::CoreNode;

pub fn default_pipe_name(network_id: Uuid) -> String {
    format!(r"\\.\pipe\tunnet-{network_id}")
}

pub fn default_pipe_path(network_id: Uuid) -> PathBuf {
    PathBuf::from(default_pipe_name(network_id))
}

fn mutex_name(network_id: Uuid) -> String {
    format!(r"Global\tunnet-coord-{network_id}")
}

pub async fn acquire(network_id: Uuid) -> anyhow::Result<Role> {
    let pipe_name = default_pipe_name(network_id);
    let pipe_path = PathBuf::from(&pipe_name);

    for _ in 0..5 {
        match ClientOptions::new().open(&pipe_name) {
            Ok(_client) => {
                return Ok(Role::Client {
                    sock_path: pipe_path,
                });
            }
            Err(e) => {
                tracing::debug!(?e, "named pipe open failed; trying coordinator");
            }
        }

        match LockFile::acquire_named(&mutex_name(network_id)) {
            Ok(lock) => {
                tracing::info!(%pipe_name, "became coordinator");
                return Ok(Role::Coordinator {
                    pipe_name,
                    _lock: lock,
                    sock_path: pipe_path,
                });
            }
            Err(_) => {
                tokio::time::sleep(std::time::Duration::from_millis(150)).await;
            }
        }
    }
    bail!("could not acquire coordinator or client role after retries")
}

/// Holds a Windows named mutex for the process lifetime.
pub struct LockFile {
    handle: HANDLE,
}

unsafe impl Send for LockFile {}
unsafe impl Sync for LockFile {}

impl LockFile {
    pub fn acquire_named(name: &str) -> anyhow::Result<Self> {
        let hname = HSTRING::from(name);
        let handle = unsafe { CreateMutexW(None, false, &hname) }
            .map_err(|e| anyhow::anyhow!("CreateMutexW({name}): {e}"))?;
        let wait = unsafe { WaitForSingleObject(handle, 0) };
        if wait == WAIT_OBJECT_0 {
            Ok(Self { handle })
        } else if wait == WAIT_TIMEOUT {
            let _ = unsafe { CloseHandle(handle) };
            bail!("named mutex held by another coordinator");
        } else {
            let _ = unsafe { CloseHandle(handle) };
            bail!("WaitForSingleObject failed: {wait:?}");
        }
    }
}

impl Drop for LockFile {
    fn drop(&mut self) {
        let _ = unsafe { CloseHandle(self.handle) };
    }
}

/// Accept loop: create a pipe instance, wait for a client, spawn handler, repeat.
pub fn spawn_coord_server(pipe_name: String, node: Arc<CoreNode>) {
    tokio::spawn(async move {
        let mut first = true;
        loop {
            let server = {
                let result = if first {
                    first = false;
                    ServerOptions::new()
                        .first_pipe_instance(true)
                        .create(&pipe_name)
                } else {
                    ServerOptions::new().create(&pipe_name)
                };
                match result {
                    Ok(s) => s,
                    Err(e) => {
                        tracing::warn!(?e, %pipe_name, "named pipe create failed");
                        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                        continue;
                    }
                }
            };
            if let Err(e) = server.connect().await {
                tracing::warn!(?e, "named pipe connect (wait for client) failed");
                continue;
            }
            let node = node.clone();
            tokio::spawn(async move {
                let (read, write) = tokio::io::split(server);
                if let Err(e) = handle_client_rw(BufReader::new(read), write, node).await {
                    tracing::warn!(?e, "coord client handling failed");
                }
            });
        }
    });
}

pub async fn connect_client(pipe_path: &Path) -> anyhow::Result<NamedPipeClient> {
    let name = pipe_path
        .to_str()
        .ok_or_else(|| anyhow::anyhow!("invalid pipe path"))?;
    ClientOptions::new()
        .open(name)
        .with_context(|| format!("open named pipe {name}"))
}

pub async fn client_open_stream(
    pipe_path: &Path,
    host: &str,
    port: u16,
) -> anyhow::Result<NamedPipeClient> {
    let mut conn = connect_client(pipe_path).await?;
    let req = ClientReq::OpenStream {
        host: host.into(),
        port,
    };
    let mut buf = serde_json::to_vec(&req)?;
    buf.push(b'\n');
    conn.write_all(&buf).await?;

    let mut br = BufReader::new(conn);
    let mut line = String::new();
    br.read_line(&mut line).await?;
    let resp: CoordResp = serde_json::from_str(line.trim())?;
    match resp {
        CoordResp::Ready => Ok(br.into_inner()),
        CoordResp::Error { message } => bail!("coord error: {message}"),
        CoordResp::Peers { .. } => bail!("unexpected peers response"),
    }
}
