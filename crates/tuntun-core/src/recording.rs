//! Dial / accept helpers for SSH session recording streams.

use anyhow::Context;
use iroh::EndpointId;
use iroh::endpoint::{RecvStream, SendStream};
use tuntun_common::recording::{RECORDING_ALPN, RecordingMeta};

use crate::iroh_pool::ConnPool;

pub async fn dial_recording(
    pool: &ConnPool,
    peer: EndpointId,
    meta: &RecordingMeta,
) -> anyhow::Result<(SendStream, RecvStream)> {
    let conn = pool.get_alpn(peer, RECORDING_ALPN).await?;
    let (mut send, recv) = conn.open_bi().await.context("open_bi recording")?;
    write_meta(&mut send, meta).await?;
    Ok((send, recv))
}

pub async fn write_meta(send: &mut SendStream, meta: &RecordingMeta) -> anyhow::Result<()> {
    let bytes = meta.encode()?;
    send.write_all(&bytes).await?;
    Ok(())
}

pub async fn read_meta(recv: &mut RecvStream) -> anyhow::Result<RecordingMeta> {
    let mut version = [0u8; 1];
    recv.read_exact(&mut version)
        .await
        .context("read recording version")?;
    let mut len_buf = [0u8; 4];
    recv.read_exact(&mut len_buf)
        .await
        .context("read recording meta len")?;
    let len = u32::from_be_bytes(len_buf) as usize;
    if len > 64 * 1024 {
        anyhow::bail!("recording meta too large ({len})");
    }
    let mut json = vec![0u8; len];
    if len > 0 {
        recv.read_exact(&mut json)
            .await
            .context("read recording meta body")?;
    }
    let mut framed = Vec::with_capacity(5 + len);
    framed.push(version[0]);
    framed.extend_from_slice(&len_buf);
    framed.extend_from_slice(&json);
    RecordingMeta::decode(&framed)
}
