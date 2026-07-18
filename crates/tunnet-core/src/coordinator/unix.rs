//! Unix domain socket coordinator (flock + UDS).

use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{Context, bail};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};
use uuid::Uuid;

use super::{ClientReq, CoordResp, Role, handle_client_rw};
use crate::node::CoreNode;

pub fn default_socket_path(network_id: Uuid) -> PathBuf {
    let base = std::env::var("TUNNET_RUNTIME_DIR").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(base).join(format!("tunnet-{network_id}.sock"))
}

pub fn default_lock_path(network_id: Uuid) -> PathBuf {
    let base = std::env::var("TUNNET_RUNTIME_DIR").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(base).join(format!("tunnet-{network_id}.lock"))
}

pub async fn acquire(network_id: Uuid) -> anyhow::Result<Role> {
    let sock = default_socket_path(network_id);
    let lock = default_lock_path(network_id);

    for _ in 0..5 {
        if sock.exists() {
            match UnixStream::connect(&sock).await {
                Ok(_conn) => {
                    return Ok(Role::Client { sock_path: sock });
                }
                Err(e) => {
                    tracing::debug!(?e, "sock exists but connect failed; will try coord");
                    let _ = std::fs::remove_file(&sock);
                }
            }
        }
        match LockFile::acquire(&lock) {
            Ok(l) => {
                let _ = std::fs::remove_file(&sock);
                let listener = UnixListener::bind(&sock)
                    .with_context(|| format!("bind {}", sock.display()))?;
                tracing::info!(path = %sock.display(), "became coordinator");
                return Ok(Role::Coordinator {
                    listener,
                    _lock: l,
                    sock_path: sock,
                });
            }
            Err(_) => {
                tokio::time::sleep(std::time::Duration::from_millis(150)).await;
            }
        }
    }
    bail!("could not acquire coordinator or client role after retries")
}

pub struct LockFile {
    _fd: i32,
    path: PathBuf,
}

impl LockFile {
    pub fn acquire(path: &Path) -> anyhow::Result<Self> {
        use std::os::unix::io::AsRawFd;
        let file = std::fs::OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .read(true)
            .open(path)?;
        let fd = file.as_raw_fd();
        let rc = unsafe { libc::flock(fd, libc::LOCK_EX | libc::LOCK_NB) };
        if rc != 0 {
            bail!("flock: another coordinator holds {}", path.display());
        }
        std::mem::forget(file);
        Ok(Self {
            _fd: fd,
            path: path.to_path_buf(),
        })
    }
}

impl Drop for LockFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

pub fn spawn_coord_server(listener: UnixListener, node: Arc<CoreNode>) {
    tokio::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((sock, _)) => {
                    let node = node.clone();
                    tokio::spawn(async move {
                        let (read, write) = sock.into_split();
                        if let Err(e) = handle_client_rw(BufReader::new(read), write, node).await {
                            tracing::warn!(?e, "coord client handling failed");
                        }
                    });
                }
                Err(e) => {
                    tracing::warn!(?e, "coord accept failed");
                    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                }
            }
        }
    });
}

/// Connect to the coordinator UDS.
pub async fn connect_client(sock: &Path) -> anyhow::Result<UnixStream> {
    Ok(UnixStream::connect(sock).await?)
}

pub async fn client_open_stream(sock: &Path, host: &str, port: u16) -> anyhow::Result<UnixStream> {
    let mut conn = connect_client(sock).await?;
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
