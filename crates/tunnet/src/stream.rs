//! Bidirectional mesh byte streams.

use std::io;
use std::pin::Pin;
use std::task::{Context, Poll};

use iroh::endpoint::{RecvStream, SendStream};
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};

/// A bidirectional byte stream to a mesh peer.
///
/// Implements [`AsyncRead`] + [`AsyncWrite`] so it composes with the tokio ecosystem
/// (`copy_bidirectional`, `BufReader`, etc.).
pub struct TunnetStream {
    inner: StreamInner,
}

enum StreamInner {
    Iroh {
        send: SendStream,
        recv: RecvStream,
    },
    #[cfg(unix)]
    Uds {
        sock: tokio::net::UnixStream,
        leftover: Vec<u8>,
    },
}

impl TunnetStream {
    pub(crate) fn from_iroh(send: SendStream, recv: RecvStream) -> Self {
        Self {
            inner: StreamInner::Iroh { send, recv },
        }
    }

    #[cfg(unix)]
    pub(crate) fn from_uds(sock: tokio::net::UnixStream, leftover: Vec<u8>) -> Self {
        Self {
            inner: StreamInner::Uds { sock, leftover },
        }
    }
}

fn map_write_err(e: iroh::endpoint::WriteError) -> io::Error {
    io::Error::other(e)
}

impl AsyncRead for TunnetStream {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        match &mut self.inner {
            StreamInner::Iroh { recv, .. } => Pin::new(recv).poll_read(cx, buf),
            #[cfg(unix)]
            StreamInner::Uds { sock, leftover } => {
                if !leftover.is_empty() {
                    let n = buf.remaining().min(leftover.len());
                    buf.put_slice(&leftover[..n]);
                    leftover.drain(..n);
                    return Poll::Ready(Ok(()));
                }
                Pin::new(sock).poll_read(cx, buf)
            }
        }
    }
}

impl AsyncWrite for TunnetStream {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<io::Result<usize>> {
        match &mut self.inner {
            StreamInner::Iroh { send, .. } => {
                Pin::new(send).poll_write(cx, buf).map_err(map_write_err)
            }
            #[cfg(unix)]
            StreamInner::Uds { sock, .. } => Pin::new(sock).poll_write(cx, buf),
        }
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        match &mut self.inner {
            StreamInner::Iroh { send, .. } => Pin::new(send).poll_flush(cx),
            #[cfg(unix)]
            StreamInner::Uds { sock, .. } => Pin::new(sock).poll_flush(cx),
        }
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        match &mut self.inner {
            StreamInner::Iroh { send, .. } => {
                let _ = send.finish();
                Pin::new(send).poll_shutdown(cx)
            }
            #[cfg(unix)]
            StreamInner::Uds { sock, .. } => Pin::new(sock).poll_shutdown(cx),
        }
    }
}
