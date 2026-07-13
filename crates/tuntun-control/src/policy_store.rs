use ed25519_dalek::{Signer, SigningKey};
use serde::Deserialize;
use sqlx::PgPool;
use tuntun_common::policy::{
    Action, PolicyBundle, PolicyRule, Protocol, Selector, SshAction, SshPolicyRule,
};
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

#[derive(sqlx::FromRow)]
struct SshRow {
    src_selector: sqlx::types::Json<Selector>,
    dst_selector: sqlx::types::Json<Selector>,
    action: String,
    users: sqlx::types::Json<Vec<String>>,
    record: bool,
    recorder: Option<sqlx::types::Json<Selector>>,
    enforce_recorder: bool,
    check_period_secs: Option<i64>,
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

    let ssh_rows: Vec<SshRow> = sqlx::query_as(
        "SELECT src_selector, dst_selector, action, users, record, recorder, \
                enforce_recorder, check_period_secs, priority \
         FROM ssh_policies WHERE network_id = $1 ORDER BY priority DESC",
    )
    .bind(network_id)
    .fetch_all(pool)
    .await?;

    sign_bundle(signing_key, rows, ssh_rows, version)
}

pub async fn load_org_bundle(
    pool: &PgPool,
    signing_key: &SigningKey,
    organization_id: &str,
    version: u64,
) -> anyhow::Result<PolicyBundle> {
    let rows: Vec<Row> = sqlx::query_as(
        "SELECT src_selector, dst_selector, action, ports, protocol, priority \
         FROM policies \
         WHERE organization_id = $1 AND network_id IS NULL \
         ORDER BY priority DESC",
    )
    .bind(organization_id)
    .fetch_all(pool)
    .await?;

    // Org-level SSH rules are not modeled yet; network-scoped only.
    sign_bundle(signing_key, rows, Vec::new(), version)
}

fn sign_bundle(
    signing_key: &SigningKey,
    rows: Vec<Row>,
    ssh_rows: Vec<SshRow>,
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

    let ssh_rules = ssh_rows
        .into_iter()
        .filter_map(|r| {
            let action = match r.action.as_str() {
                "accept" => SshAction::Accept,
                "check" => SshAction::Check,
                "deny" => SshAction::Deny,
                _ => return None,
            };
            Some(SshPolicyRule {
                src: r.src_selector.0,
                dst: r.dst_selector.0,
                action,
                users: r.users.0,
                record: r.record,
                recorder: r.recorder.map(|j| j.0),
                enforce_recorder: r.enforce_recorder,
                check_period_secs: r.check_period_secs.map(|s| s as u64),
                priority: r.priority,
            })
        })
        .collect::<Vec<_>>();

    let mut bundle = PolicyBundle {
        rules,
        ssh_rules,
        version,
        signature: String::new(),
    };
    let sign_bytes = serde_json::to_vec(&(&bundle.rules, &bundle.ssh_rules, bundle.version))?;
    let sig = signing_key.sign(&sign_bytes);
    bundle.signature =
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, sig.to_bytes());
    Ok(bundle)
}

#[allow(dead_code)]
fn _touch<'de, T: Deserialize<'de>>() {}
