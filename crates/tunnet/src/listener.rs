//! Inbound mesh stream listener.

use tokio::sync::mpsc;

use crate::error::{Error, Result};
use crate::peer::Peer;
use crate::stream::TunnetStream;
use crate::types::StreamHeader;

pub(crate) struct InboundConnection {
    pub stream: TunnetStream,
    pub peer: Peer,
    pub header: StreamHeader,
}

/// Accepts inbound application streams from mesh peers.
///
/// Similar in shape to [`tokio::net::TcpListener`]: call [`StreamListener::accept`]
/// in a loop. Only available when this process is the coordinator (or standalone).
pub struct StreamListener {
    rx: mpsc::Receiver<InboundConnection>,
}

impl StreamListener {
    pub(crate) fn new(rx: mpsc::Receiver<InboundConnection>) -> Self {
        Self { rx }
    }

    /// Accept the next inbound stream.
    ///
    /// Returns an error when the node has shut down and the acceptor closed.
    pub async fn accept(&mut self) -> Result<(TunnetStream, Peer, StreamHeader)> {
        let inbound = self
            .rx
            .recv()
            .await
            .ok_or_else(|| Error::Internal("stream listener closed (node shut down)".into()))?;
        Ok((inbound.stream, inbound.peer, inbound.header))
    }
}
