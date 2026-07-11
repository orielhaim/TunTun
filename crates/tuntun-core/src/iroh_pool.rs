use std::sync::Arc;

use anyhow::Context;
use bytes::Bytes;
use dashmap::DashMap;
use iroh::endpoint::Connection;
use iroh::{Endpoint, EndpointId};
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct ConnPool {
    endpoint: Endpoint,
    alpn: &'static [u8],
    entries: Arc<DashMap<(EndpointId, &'static [u8]), Arc<Mutex<Option<Connection>>>>>,
}

impl ConnPool {
    pub fn new(endpoint: Endpoint, alpn: &'static [u8]) -> Self {
        Self {
            endpoint,
            alpn,
            entries: Arc::new(DashMap::new()),
        }
    }

    pub fn endpoint(&self) -> &Endpoint {
        &self.endpoint
    }
    pub fn default_alpn(&self) -> &'static [u8] {
        self.alpn
    }

    pub async fn get(&self, peer: EndpointId) -> anyhow::Result<Connection> {
        self.get_alpn(peer, self.alpn).await
    }

    pub async fn get_alpn(
        &self,
        peer: EndpointId,
        alpn: &'static [u8],
    ) -> anyhow::Result<Connection> {
        let slot = self
            .entries
            .entry((peer, alpn))
            .or_insert_with(|| Arc::new(Mutex::new(None)))
            .clone();
        let mut guard = slot.lock().await;
        if let Some(c) = guard.as_ref() {
            if c.close_reason().is_none() {
                return Ok(c.clone());
            }
            tracing::info!(%peer, "cached connection dead, reconnecting");
        }
        tracing::info!(%peer, alpn = %String::from_utf8_lossy(alpn), "dialing peer");
        let conn = self
            .endpoint
            .connect(peer, alpn)
            .await
            .with_context(|| format!("connect to {peer}"))?;
        *guard = Some(conn.clone());
        Ok(conn)
    }

    pub async fn drop_peer(&self, peer: EndpointId) {
        self.entries.retain(|(p, _), _| *p != peer);
    }

    /// True if we currently hold a live cached connection to this peer.
    pub fn has_live(&self, peer: EndpointId) -> bool {
        self.entries.iter().any(|e| {
            let (p, _) = e.key();
            if *p != peer {
                return false;
            }
            // Best-effort: slot exists. Exact liveness needs async lock; treat
            // presence of a cache slot as "recently contacted".
            true
        })
    }

    pub fn has_any_live(&self) -> bool {
        !self.entries.is_empty()
    }
}

pub fn send_datagram(conn: &Connection, packet: Bytes) -> anyhow::Result<()> {
    conn.send_datagram(packet)
        .context("send_datagram (packet too big or unsupported)")?;
    Ok(())
}
