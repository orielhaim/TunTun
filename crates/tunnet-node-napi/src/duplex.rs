use anyhow::Result;
use iroh::endpoint::{RecvStream, SendStream};
#[cfg(any(unix, windows))]
use tokio::io::{AsyncReadExt, AsyncWriteExt};
pub enum Duplex {
    Iroh {
        send: SendStream,
        recv: RecvStream,
    },
    #[cfg(unix)]
    Local {
        sock: tokio::net::UnixStream,
        leftover: Vec<u8>,
    },
    #[cfg(windows)]
    Local {
        sock: tokio::net::windows::named_pipe::NamedPipeClient,
        leftover: Vec<u8>,
    },
}

impl Duplex {
    pub async fn read(&mut self, buf: &mut [u8]) -> Result<usize> {
        match self {
            Duplex::Iroh { recv, .. } => Ok(recv.read(buf).await?.unwrap_or(0)),
            #[cfg(any(unix, windows))]
            Duplex::Local { sock, leftover } => {
                if !leftover.is_empty() {
                    let n = buf.len().min(leftover.len());
                    buf[..n].copy_from_slice(&leftover[..n]);
                    leftover.drain(..n);
                    return Ok(n);
                }
                Ok(sock.read(buf).await?)
            }
        }
    }

    pub async fn write_all(&mut self, data: &[u8]) -> Result<()> {
        match self {
            Duplex::Iroh { send, .. } => Ok(send.write_all(data).await?),
            #[cfg(any(unix, windows))]
            Duplex::Local { sock, .. } => Ok(sock.write_all(data).await?),
        }
    }

    pub async fn shutdown(&mut self) -> Result<()> {
        match self {
            Duplex::Iroh { send, .. } => {
                send.finish().ok();
                Ok(())
            }
            #[cfg(any(unix, windows))]
            Duplex::Local { sock, .. } => Ok(sock.shutdown().await?),
        }
    }
}
