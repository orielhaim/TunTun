//! Mesh SSH dial / header I/O over QUIC streams.

use anyhow::Context;
use iroh::EndpointId;
use iroh::endpoint::{RecvStream, SendStream};
use tunnet_common::ssh::{SSH_ALPN, SshRequestHeader, SshResponseHeader};

use crate::iroh_pool::ConnPool;

pub async fn dial_ssh(
    pool: &ConnPool,
    peer: EndpointId,
    header: &SshRequestHeader,
) -> anyhow::Result<(SendStream, RecvStream, SshResponseHeader)> {
    let conn = pool.get_alpn(peer, SSH_ALPN).await?;
    let (mut send, mut recv) = conn.open_bi().await.context("open_bi ssh")?;
    write_request(&mut send, header).await?;
    let response = read_response(&mut recv).await?;
    Ok((send, recv, response))
}

pub async fn write_request(send: &mut SendStream, header: &SshRequestHeader) -> anyhow::Result<()> {
    let bytes = header.encode()?;
    // Length-prefixed frame so the peer knows when the header ends.
    let len = u32::try_from(bytes.len()).context("ssh request too large")?;
    send.write_all(&len.to_be_bytes()).await?;
    send.write_all(&bytes).await?;
    Ok(())
}

pub async fn read_request(recv: &mut RecvStream) -> anyhow::Result<SshRequestHeader> {
    let bytes = read_frame(recv).await?;
    SshRequestHeader::decode(&bytes)
}

pub async fn write_response(
    send: &mut SendStream,
    header: &SshResponseHeader,
) -> anyhow::Result<()> {
    let bytes = header.encode()?;
    let len = u32::try_from(bytes.len()).context("ssh response too large")?;
    send.write_all(&len.to_be_bytes()).await?;
    send.write_all(&bytes).await?;
    Ok(())
}

pub async fn read_response(recv: &mut RecvStream) -> anyhow::Result<SshResponseHeader> {
    let bytes = read_frame(recv).await?;
    SshResponseHeader::decode(&bytes)
}

async fn read_frame(recv: &mut RecvStream) -> anyhow::Result<Vec<u8>> {
    let mut len_buf = [0u8; 4];
    recv.read_exact(&mut len_buf)
        .await
        .context("read frame len")?;
    let len = u32::from_be_bytes(len_buf) as usize;
    if len > 64 * 1024 {
        anyhow::bail!("ssh frame too large ({len})");
    }
    let mut buf = vec![0u8; len];
    if len > 0 {
        recv.read_exact(&mut buf).await.context("read frame body")?;
    }
    Ok(buf)
}
