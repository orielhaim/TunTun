use ed25519_dalek::{Signer, SigningKey};
use serde::Deserialize;
use sqlx::PgPool;
use tuntun_common::policy::{Action, PolicyBundle, PolicyRule, Protocol, Selector};
use uuid::Uuid;

#[derive(sqlx::FromRow)]
struct Row {
    src_selector: sqlx::types::Json<Selector>,
    dst_selector: sqlx::types::Json<Selector>,
    action: String,
    ports: sqlx::types::Json<Vec<tuntun_common::policy::PortRange>>,
    protocol: Option<String>,
    priority: i32,
}

pub async fn load_network_bundle(
    pool: &PgPool,
    signing_key: &SigningKey,
    network_id: Uuid,
    version: u64,
) -> anyhow::Result<PolicyBundle> {
    let rows: Vec<Row> = sqlx::query_as(
        "SELECT src_selector, dst_selector, action, ports, protocol, priority \
         FROM policies WHERE network_id = $1 ORDER BY priority DESC",
    )
    .bind(network_id)
    .fetch_all(pool)
    .await?;

    sign_bundle(signing_key, rows, version)
}

pub async fn load_org_bundle(
    pool: &PgPool,
    signing_key: &SigningKey,
    organization_id: &str,
    version: u64,
) -> anyhow::Result<PolicyBundle> {
    let rows: Vec<Row> = sqlx::query_as(
        "SELECT src_selector, dst_selector, action, ports, protocol, priority \
         FROM organization_policies WHERE organization_id = $1 ORDER BY priority DESC",
    )
    .bind(organization_id)
    .fetch_all(pool)
    .await?;

    sign_bundle(signing_key, rows, version)
}

fn sign_bundle(
    signing_key: &SigningKey,
    rows: Vec<Row>,
    version: u64,
) -> anyhow::Result<PolicyBundle> {
    let rules = rows
        .into_iter()
        .map(|r| PolicyRule {
            src: r.src_selector.0,
            dst: r.dst_selector.0,
            action: if r.action == "allow" {
                Action::Allow
            } else {
                Action::Deny
            },
            ports: r.ports.0,
            protocol: r.protocol.and_then(|p| match p.as_str() {
                "tcp" => Some(Protocol::Tcp),
                "udp" => Some(Protocol::Udp),
                "icmp" => Some(Protocol::Icmp),
                "any" => Some(Protocol::Any),
                _ => None,
            }),
            priority: r.priority,
        })
        .collect::<Vec<_>>();

    let mut bundle = PolicyBundle {
        rules,
        version,
        signature: String::new(),
    };
    let sign_bytes = serde_json::to_vec(&(&bundle.rules, bundle.version))?;
    let sig = signing_key.sign(&sign_bytes);
    bundle.signature =
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, sig.to_bytes());
    Ok(bundle)
}

#[allow(dead_code)]
fn _touch<'de, T: Deserialize<'de>>() {}
