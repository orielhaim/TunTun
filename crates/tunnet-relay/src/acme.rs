//! Optional Let's Encrypt ACME HTTP-01 provisioning for the public HTTPS listener.
//!
//! Wildcards are not supported (HTTP-01 cannot prove `*.domain`). Use `--cert/--key`
//! or a DNS-01 workflow outside this binary for wildcard certificates.

use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, bail};
use dashmap::DashMap;
use instant_acme::{
    Account, AccountCredentials, AuthorizationStatus, ChallengeType, Identifier, LetsEncrypt,
    NewAccount, NewOrder, OrderStatus, RetryPolicy,
};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

const CERT_FILE: &str = "cert.pem";
const KEY_FILE: &str = "key.pem";
const ACCOUNT_FILE: &str = "account.json";
const DOMAINS_FILE: &str = "domains.txt";
/// Renew when fewer than this many days remain until expiry.
const RENEW_WITHIN_DAYS: i64 = 30;

type ChallengeMap = Arc<DashMap<String, String>>;

#[derive(Clone)]
pub struct AcmeConfig {
    pub email: Option<String>,
    pub domains: Vec<String>,
    pub dir: PathBuf,
    pub staging: bool,
    pub http_bind: SocketAddr,
}

impl AcmeConfig {
    pub fn parse_domains(raw: &str) -> anyhow::Result<Vec<String>> {
        let domains: Vec<String> = raw
            .split(',')
            .map(|s| s.trim().to_ascii_lowercase())
            .filter(|s| !s.is_empty())
            .collect();
        if domains.is_empty() {
            bail!("--acme-domain must list at least one hostname");
        }
        for d in &domains {
            if d.starts_with("*.") || d.contains('*') {
                bail!(
                    "ACME HTTP-01 does not support wildcards ({d}). \
                     Use --cert/--key (or DNS-01 elsewhere) for wildcard TLS."
                );
            }
            if d.contains('/') || d.contains(' ') {
                bail!("invalid ACME domain: {d}");
            }
        }
        Ok(domains)
    }
}

/// Obtain or load a cached certificate; spawn HTTP-01 challenge listener on :80.
pub async fn obtain_or_load(cfg: &AcmeConfig) -> anyhow::Result<(String, String)> {
    std::fs::create_dir_all(&cfg.dir)
        .with_context(|| format!("create ACME dir {}", cfg.dir.display()))?;

    let challenges: ChallengeMap = Arc::new(DashMap::new());
    // Challenge HTTP listener stays up for the process lifetime (renewals / late LE retries).
    spawn_challenge_http(cfg.http_bind, challenges.clone());

    if let Some((cert, key)) = load_cached_if_fresh(cfg)? {
        tracing::info!(
            domains = ?cfg.domains,
            dir = %cfg.dir.display(),
            "using cached ACME certificate"
        );
        return Ok((cert, key));
    }

    tracing::info!(
        domains = ?cfg.domains,
        staging = cfg.staging,
        "requesting Let's Encrypt certificate via HTTP-01"
    );
    let (cert, key) = order_certificate(cfg, challenges).await?;
    save_cached(cfg, &cert, &key)?;
    Ok((cert, key))
}

fn load_cached_if_fresh(cfg: &AcmeConfig) -> anyhow::Result<Option<(String, String)>> {
    let cert_path = cfg.dir.join(CERT_FILE);
    let key_path = cfg.dir.join(KEY_FILE);
    let domains_path = cfg.dir.join(DOMAINS_FILE);
    if !cert_path.exists() || !key_path.exists() {
        return Ok(None);
    }
    if domains_path.exists() {
        let stored = std::fs::read_to_string(&domains_path).unwrap_or_default();
        let stored_domains: Vec<String> = stored
            .lines()
            .map(|s| s.trim().to_ascii_lowercase())
            .filter(|s| !s.is_empty())
            .collect();
        if stored_domains != cfg.domains {
            tracing::info!("ACME domain list changed - re-issuing certificate");
            return Ok(None);
        }
    }
    let cert = std::fs::read_to_string(&cert_path)?;
    let key = std::fs::read_to_string(&key_path)?;
    if needs_renewal(&cert) {
        tracing::info!("cached ACME certificate expiring soon - renewing");
        return Ok(None);
    }
    Ok(Some((cert, key)))
}

fn needs_renewal(cert_pem: &str) -> bool {
    let Some(until) = crate::https::cert_valid_until(cert_pem) else {
        return true;
    };
    let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&until) else {
        return true;
    };
    let remaining = dt.signed_duration_since(chrono::Utc::now());
    remaining.num_days() < RENEW_WITHIN_DAYS
}

fn save_cached(cfg: &AcmeConfig, cert: &str, key: &str) -> anyhow::Result<()> {
    std::fs::write(cfg.dir.join(CERT_FILE), cert)?;
    std::fs::write(cfg.dir.join(KEY_FILE), key)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(cfg.dir.join(KEY_FILE))?.permissions();
        perms.set_mode(0o600);
        std::fs::set_permissions(cfg.dir.join(KEY_FILE), perms)?;
    }
    std::fs::write(cfg.dir.join(DOMAINS_FILE), cfg.domains.join("\n"))?;
    Ok(())
}

async fn order_certificate(
    cfg: &AcmeConfig,
    challenges: ChallengeMap,
) -> anyhow::Result<(String, String)> {
    let directory = if cfg.staging {
        LetsEncrypt::Staging.url()
    } else {
        LetsEncrypt::Production.url()
    };

    let account = load_or_create_account(cfg, directory).await?;

    let identifiers: Vec<Identifier> = cfg
        .domains
        .iter()
        .map(|d| Identifier::Dns(d.clone()))
        .collect();
    let mut order = account
        .new_order(&NewOrder::new(identifiers.as_slice()))
        .await
        .context("ACME new_order")?;

    let mut authorizations = order.authorizations();
    while let Some(result) = authorizations.next().await {
        let mut authz = result.context("ACME authorization")?;
        match authz.status {
            AuthorizationStatus::Pending => {}
            AuthorizationStatus::Valid => continue,
            other => bail!("unexpected ACME authorization status: {other:?}"),
        }

        let mut challenge = authz
            .challenge(ChallengeType::Http01)
            .context("no HTTP-01 challenge offered by CA")?;
        let token = challenge.token.clone();
        let key_auth = challenge.key_authorization().as_str().to_string();
        challenges.insert(token, key_auth);
        challenge
            .set_ready()
            .await
            .context("ACME set_challenge_ready")?;
    }

    let status = order
        .poll_ready(&RetryPolicy::default())
        .await
        .context("ACME poll_ready")?;
    if status != OrderStatus::Ready {
        bail!("ACME order not ready: {status:?}");
    }

    let private_key_pem = order.finalize().await.context("ACME finalize")?;
    let cert_chain_pem = order
        .poll_certificate(&RetryPolicy::default())
        .await
        .context("ACME poll_certificate")?;

    challenges.clear();
    Ok((cert_chain_pem, private_key_pem))
}

async fn load_or_create_account(cfg: &AcmeConfig, directory: &str) -> anyhow::Result<Account> {
    let account_path = cfg.dir.join(ACCOUNT_FILE);
    let contact: Vec<String> = cfg
        .email
        .as_ref()
        .map(|e| {
            if e.starts_with("mailto:") {
                e.clone()
            } else {
                format!("mailto:{e}")
            }
        })
        .into_iter()
        .collect();
    let contact_refs: Vec<&str> = contact.iter().map(|s| s.as_str()).collect();

    if account_path.exists() {
        let raw = std::fs::read_to_string(&account_path)
            .with_context(|| format!("read {}", account_path.display()))?;
        let credentials: AccountCredentials =
            serde_json::from_str(&raw).context("parse ACME account credentials")?;
        match Account::builder()?.from_credentials(credentials).await {
            Ok(account) => {
                tracing::debug!("restored ACME account from cache");
                return Ok(account);
            }
            Err(e) => {
                tracing::warn!(?e, "failed to restore ACME account - creating new one");
            }
        }
    }

    let (account, credentials) = Account::builder()?
        .create(
            &NewAccount {
                contact: &contact_refs,
                terms_of_service_agreed: true,
                only_return_existing: false,
            },
            directory.to_owned(),
            None,
        )
        .await
        .context("create ACME account")?;

    let json = serde_json::to_string_pretty(&credentials)?;
    std::fs::write(&account_path, json)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&account_path)?.permissions();
        perms.set_mode(0o600);
        std::fs::set_permissions(&account_path, perms)?;
    }
    Ok(account)
}

fn spawn_challenge_http(bind: SocketAddr, challenges: ChallengeMap) {
    tokio::spawn(async move {
        let listener = match TcpListener::bind(bind).await {
            Ok(l) => l,
            Err(e) => {
                tracing::error!(?e, %bind, "ACME HTTP-01 listener failed to bind (port 80 required)");
                return;
            }
        };
        tracing::info!(%bind, "ACME HTTP-01 challenge listener ready");
        loop {
            match listener.accept().await {
                Ok((stream, peer)) => {
                    let challenges = challenges.clone();
                    tokio::spawn(async move {
                        if let Err(e) = handle_challenge_conn(stream, challenges).await {
                            tracing::debug!(?e, %peer, "ACME challenge connection ended");
                        }
                    });
                }
                Err(e) => {
                    tracing::warn!(?e, "ACME accept error");
                    tokio::time::sleep(Duration::from_millis(50)).await;
                }
            }
        }
    });
}

async fn handle_challenge_conn(
    mut stream: TcpStream,
    challenges: ChallengeMap,
) -> anyhow::Result<()> {
    let mut buf = vec![0u8; 4096];
    let n = stream.read(&mut buf).await?;
    buf.truncate(n);
    let req = String::from_utf8_lossy(&buf);
    let path = req
        .lines()
        .next()
        .and_then(|line| {
            let mut parts = line.split_whitespace();
            let _method = parts.next()?;
            parts.next()
        })
        .unwrap_or("/");

    let token = path
        .strip_prefix("/.well-known/acme-challenge/")
        .map(|t| t.split('?').next().unwrap_or(t).trim_end_matches('/'));

    let (status, body) = match token {
        Some(token) if !token.is_empty() => match challenges.get(token) {
            Some(auth) => {
                tracing::info!(%token, "serving ACME HTTP-01 challenge");
                ("200 OK", auth.clone())
            }
            None => {
                tracing::debug!(%token, "unknown ACME challenge token");
                ("404 Not Found", "not found\n".into())
            }
        },
        _ => ("404 Not Found", "not found\n".into()),
    };

    let resp = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(resp.as_bytes()).await?;
    stream.shutdown().await.ok();
    Ok(())
}

/// Default ACME cache directory under the relay state dir.
pub fn default_acme_dir(state_dir: &Path) -> PathBuf {
    state_dir.join("acme")
}
