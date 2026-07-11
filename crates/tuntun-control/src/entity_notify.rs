//! Dashboard live updates for tunnels, serves, and relays via Postgres NOTIFY.

use sqlx::PgPool;

pub const ENTITY_CHANNEL: &str = "tuntun:entity_changed";

pub async fn emit_entity_changed(
    pool: &PgPool,
    organization_id: &str,
    kind: &str,
    entity_id: &str,
    network_id: Option<&str>,
) -> anyhow::Result<()> {
    let payload = serde_json::json!({
        "organizationId": organization_id,
        "kind": kind,
        "entityId": entity_id,
        "networkId": network_id,
    })
    .to_string();

    sqlx::query("SELECT pg_notify($1, $2)")
        .bind(ENTITY_CHANNEL)
        .bind(payload)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn emit_tunnel_changed(
    pool: &PgPool,
    organization_id: &str,
    network_id: &str,
    tunnel_id: &str,
) -> anyhow::Result<()> {
    emit_entity_changed(pool, organization_id, "tunnel", tunnel_id, Some(network_id)).await
}

pub async fn emit_serve_changed(
    pool: &PgPool,
    organization_id: &str,
    network_id: &str,
    serve_id: &str,
) -> anyhow::Result<()> {
    emit_entity_changed(pool, organization_id, "serve", serve_id, Some(network_id)).await
}

pub async fn emit_relay_changed(
    pool: &PgPool,
    organization_id: &str,
    relay_id: &str,
) -> anyhow::Result<()> {
    emit_entity_changed(pool, organization_id, "relay", relay_id, None).await
}

/// Resolve org+network for a tunnel and notify.
pub async fn notify_tunnel_status(pool: &PgPool, tunnel_id: &str) -> anyhow::Result<()> {
    let row: Option<(String, uuid::Uuid)> = sqlx::query_as(
        "SELECT d.organization_id, t.network_id \
         FROM tunnels t \
         JOIN devices d ON d.endpoint_id = t.endpoint_id \
         WHERE t.id = $1::uuid",
    )
    .bind(tunnel_id)
    .fetch_optional(pool)
    .await?;

    if let Some((org_id, network_id)) = row {
        emit_tunnel_changed(pool, &org_id, &network_id.to_string(), tunnel_id).await?;
    }
    Ok(())
}

/// Resolve org+network for a serve and notify.
pub async fn notify_serve_status(pool: &PgPool, serve_id: &str) -> anyhow::Result<()> {
    let row: Option<(String, uuid::Uuid)> = sqlx::query_as(
        "SELECT d.organization_id, s.network_id \
         FROM serves s \
         JOIN devices d ON d.endpoint_id = s.endpoint_id \
         WHERE s.id = $1::uuid",
    )
    .bind(serve_id)
    .fetch_optional(pool)
    .await?;

    if let Some((org_id, network_id)) = row {
        emit_serve_changed(pool, &org_id, &network_id.to_string(), serve_id).await?;
    }
    Ok(())
}
