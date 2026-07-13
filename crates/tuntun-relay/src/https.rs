//! Public HTTPS listener - TLS terminate by SNI, reverse-tunnel splice to agent.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Instant;

use anyhow::{Context, bail};
use argon2::{Argon2, PasswordHash, PasswordVerifier};
use base64::Engine;
use base64::engine::general_purpose::STANDARD as B64;
use rustls::ServerConfig;
use rustls::pki_types::{CertificateDer, PrivateKeyDer};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio_rustls::TlsAcceptor;
use tokio_rustls::server::TlsStream;

use crate::agent_accept::AuthStore;
use crate::control::ControlClient;
use crate::registry::TunnelRegistry;

pub async fn serve_https(
    bind: SocketAddr,
    acceptor: TlsAcceptor,
    registry: TunnelRegistry,
    auth: AuthStore,
    control: Option<ControlClient>,
) -> anyhow::Result<()> {
    let listener = TcpListener::bind(bind)
        .await
        .with_context(|| format!("bind HTTPS {bind}"))?;
    tracing::info!(%bind, "HTTPS listener ready");

    loop {
        let (tcp, peer) = listener.accept().await?;
        let acceptor = acceptor.clone();
        let registry = registry.clone();
        let auth = auth.clone();
        let control = control.clone();
        tokio::spawn(async move {
            if let Err(e) = handle_https_client(tcp, peer, acceptor, registry, auth, control).await
            {
                tracing::debug!(?e, %peer, "HTTPS session ended");
            }
        });
    }
}

async fn handle_https_client(
    tcp: TcpStream,
    peer: SocketAddr,
    acceptor: TlsAcceptor,
    registry: TunnelRegistry,
    auth: AuthStore,
    control: Option<ControlClient>,
) -> anyhow::Result<()> {
    let started = Instant::now();
    let tls = acceptor.accept(tcp).await.context("TLS handshake")?;
    let host = extract_server_name(&tls)
        .with_context(|| format!("client {peer} sent no SNI - cannot route tunnel"))?;

    let slot = registry
        .get(&host)
        .with_context(|| format!("no tunnel for host {host}"))?;
    let conn = {
        let guard = slot.conn.lock();
        guard
            .clone()
            .with_context(|| format!("tunnel for {host} not connected"))?
    };

    let tunnel_auth = auth.get(&slot.subdomain);
    let basic_user = tunnel_auth
        .as_ref()
        .and_then(|t| t.basic_auth_user.as_deref());
    let basic_hash = tunnel_auth
        .as_ref()
        .and_then(|t| t.basic_auth_password_hash.as_deref());

    let (send, recv) = conn.open_bi().await.context("open bi to agent")?;
    tracing::debug!(%host, %peer, "proxying to agent");

    let tunnel_id = slot.tunnel_id.clone();
    let source_ip = peer.ip().to_string();
    let meta = splice_tls_to_quic(tls, send, recv, basic_user, basic_hash).await?;

    if let Some(client) = control
        && let Some((method, path)) = meta.request
    {
        let latency_ms = started.elapsed().as_millis().min(i32::MAX as u128) as i32;
        client.spawn_traffic_log(
            tunnel_id,
            method,
            path,
            meta.status_code.unwrap_or(0),
            latency_ms,
            Some(source_ip),
        );
    }
    Ok(())
}

struct SpliceMeta {
    request: Option<(String, String)>,
    status_code: Option<i32>,
}

fn extract_server_name(tls: &TlsStream<TcpStream>) -> Option<String> {
    let (_, conn) = tls.get_ref();
    conn.server_name().map(|s| s.to_string())
}

/// Peek the first TLS application bytes for an HTTP request, enforce basic auth,
/// then splice.
async fn splice_tls_to_quic(
    tls: TlsStream<TcpStream>,
    mut send: iroh::endpoint::SendStream,
    mut recv: iroh::endpoint::RecvStream,
    basic_user: Option<&str>,
    basic_hash: Option<&str>,
) -> anyhow::Result<SpliceMeta> {
    let (mut tls_read, mut tls_write) = tokio::io::split(tls);

    // Peek enough to parse the request line + headers.
    let mut peek = vec![0u8; 16 * 1024];
    let n = tls_read.read(&mut peek).await?;
    peek.truncate(n);
    let request = if n > 0 {
        parse_http_request_line(&peek)
    } else {
        None
    };

    if let (Some(user), Some(hash)) = (basic_user, basic_hash)
        && (n == 0 || !verify_basic_auth(&peek, user, hash))
    {
        let body = "Unauthorized\n";
        let resp = format!(
            "HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm=\"TunTun\"\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        tls_write.write_all(resp.as_bytes()).await?;
        tls_write.shutdown().await.ok();
        return Ok(SpliceMeta {
            request,
            status_code: Some(401),
        });
    }

    if n > 0 {
        send.write_all(&peek).await?;
    }

    let up = async {
        let mut buf = vec![0u8; 32 * 1024];
        loop {
            let n = tls_read.read(&mut buf).await?;
            if n == 0 {
                break;
            }
            send.write_all(&buf[..n]).await?;
        }
        send.finish().ok();
        Ok::<_, anyhow::Error>(())
    };
    let down = async {
        let mut buf = vec![0u8; 32 * 1024];
        while let Some(n) = recv.read(&mut buf).await? {
            tls_write.write_all(&buf[..n]).await?;
        }
        tls_write.shutdown().await.ok();
        Ok::<_, anyhow::Error>(())
    };
    let (a, b) = tokio::join!(up, down);
    a?;
    b?;
    Ok(SpliceMeta {
        request,
        status_code: None,
    })
}

fn verify_basic_auth(buf: &[u8], expected_user: &str, password_hash: &str) -> bool {
    let header = extract_header(buf, "authorization");
    let Some(value) = header else {
        return false;
    };
    let Some(encoded) = value
        .strip_prefix("Basic ")
        .or_else(|| value.strip_prefix("basic "))
    else {
        return false;
    };
    let Ok(decoded) = B64.decode(encoded.trim()) else {
        return false;
    };
    let Ok(pair) = String::from_utf8(decoded) else {
        return false;
    };
    let Some((user, password)) = pair.split_once(':') else {
        return false;
    };
    if user != expected_user {
        return false;
    }
    let Ok(parsed) = PasswordHash::new(password_hash) else {
        return false;
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

fn extract_header<'a>(buf: &'a [u8], name: &str) -> Option<&'a str> {
    let text = std::str::from_utf8(buf).ok()?;
    let name_lower = name.to_ascii_lowercase();
    for line in text.lines().skip(1) {
        if line.is_empty() || line == "\r" {
            break;
        }
        let line = line.trim_end_matches('\r');
        let Some((k, v)) = line.split_once(':') else {
            continue;
        };
        if k.trim().eq_ignore_ascii_case(&name_lower) {
            return Some(v.trim());
        }
    }
    None
}

fn parse_http_request_line(buf: &[u8]) -> Option<(String, String)> {
    let text = std::str::from_utf8(buf).ok()?;
    let line = text.lines().next()?.trim();
    if line.is_empty() {
        return None;
    }
    let mut parts = line.split_whitespace();
    let method = parts.next()?.to_string();
    let target = parts.next()?;
    let path = target.split('?').next().unwrap_or(target).to_string();
    if method.is_empty() || path.is_empty() {
        return None;
    }
    Some((method, path))
}

pub fn build_tls_acceptor(cert_pem: &str, key_pem: &str) -> anyhow::Result<TlsAcceptor> {
    let mut cert_reader = std::io::Cursor::new(cert_pem.as_bytes());
    let certs: Vec<CertificateDer<'static>> = rustls_pemfile::certs(&mut cert_reader)
        .collect::<Result<Vec<_>, _>>()
        .context("parse cert PEM")?;
    if certs.is_empty() {
        bail!("no certificates in PEM");
    }
    let mut key_reader = std::io::Cursor::new(key_pem.as_bytes());
    let key: PrivateKeyDer<'static> = rustls_pemfile::private_key(&mut key_reader)
        .context("parse key PEM")?
        .context("no private key in PEM")?;

    let mut cfg = ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(certs, key)
        .context("rustls ServerConfig")?;
    cfg.alpn_protocols = vec![b"http/1.1".to_vec()];
    Ok(TlsAcceptor::from(Arc::new(cfg)))
}

/// Parse `notAfter` from the first certificate in a PEM bundle as RFC3339.
pub fn cert_valid_until(cert_pem: &str) -> Option<String> {
    let mut reader = std::io::Cursor::new(cert_pem.as_bytes());
    let cert = rustls_pemfile::certs(&mut reader).next()?.ok()?;
    let (_, parsed) = x509_parser::parse_x509_certificate(cert.as_ref()).ok()?;
    let not_after = parsed.validity().not_after;
    // ASN.1 Time → chrono via timestamp when possible.
    let ts = not_after.timestamp();
    chrono::DateTime::from_timestamp(ts, 0).map(|dt| dt.to_rfc3339())
}

/// Ephemeral self-signed cert for local/dev when --cert/--key are omitted.
pub fn generate_dev_cert(common_name: &str) -> anyhow::Result<(String, String)> {
    let mut params = rcgen::CertificateParams::new(vec![
        common_name.to_string(),
        "localhost".into(),
        "*.localhost".into(),
    ])?;
    params
        .distinguished_name
        .push(rcgen::DnType::CommonName, common_name);
    let key = rcgen::KeyPair::generate()?;
    let cert = params.self_signed(&key)?;
    Ok((cert.pem(), key.serialize_pem()))
}
