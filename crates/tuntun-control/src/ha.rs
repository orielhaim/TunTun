//! High-availability node group failover.

use sqlx::PgPool;
use uuid::Uuid;

const STALE_SECS: i64 = 30;

/// Promote a standby when the active member has gone silent.
/// Returns network IDs that need a snapshot bump/notify.
pub async fn reconcile_failover(pool: &PgPool) -> anyhow::Result<Vec<(Uuid, String)>> {
    let groups: Vec<(Uuid, Uuid, Option<String>, String)> = sqlx::query_as(
        "SELECT ng.id, ng.network_id, ng.active_endpoint_id, n.organization_id \
         FROM node_groups ng \
         JOIN networks n ON n.id = ng.network_id \
         WHERE ng.ha_enabled",
    )
    .fetch_all(pool)
    .await?;

    let mut bumped = Vec::new();

    for (group_id, network_id, active, organization_id) in groups {
        let needs_election = match &active {
            None => true,
            Some(eid) => {
                let healthy: Option<bool> = sqlx::query_scalar(
                    "SELECT agent_connected AND last_heartbeat_at > now() - make_interval(secs => $2) \
                     FROM devices WHERE endpoint_id = $1",
                )
                .bind(eid)
                .bind(STALE_SECS as f64)
                .fetch_optional(pool)
                .await?;
                !healthy.unwrap_or(false)
            }
        };

        if !needs_election {
            continue;
        }

        let next: Option<(String,)> = sqlx::query_as(
            "SELECT ngm.endpoint_id \
             FROM node_group_members ngm \
             JOIN devices d ON d.endpoint_id = ngm.endpoint_id \
             WHERE ngm.group_id = $1 \
               AND d.agent_connected \
               AND d.last_heartbeat_at > now() - make_interval(secs => $2) \
             ORDER BY ngm.priority ASC, ngm.joined_at ASC \
             LIMIT 1",
        )
        .bind(group_id)
        .bind(STALE_SECS as f64)
        .fetch_optional(pool)
        .await?;

        let Some((new_active,)) = next else {
            if active.is_some() {
                sqlx::query("UPDATE node_groups SET active_endpoint_id = NULL WHERE id = $1")
                    .bind(group_id)
                    .execute(pool)
                    .await?;
                tracing::warn!(%group_id, "HA group has no healthy members");
                bumped.push((network_id, organization_id));
            }
            continue;
        };

        if active.as_deref() == Some(new_active.as_str()) {
            continue;
        }

        sqlx::query("UPDATE node_groups SET active_endpoint_id = $2 WHERE id = $1")
            .bind(group_id)
            .bind(&new_active)
            .execute(pool)
            .await?;

        sqlx::query("UPDATE networks SET version = version + 1 WHERE id = $1")
            .bind(network_id)
            .execute(pool)
            .await?;

        sqlx::query("SELECT pg_notify('tuntun:network_changed', $1)")
            .bind(network_id.to_string())
            .execute(pool)
            .await?;

        tracing::info!(
            %group_id,
            %network_id,
            from = ?active,
            to = %new_active,
            "HA failover promoted new active"
        );
        bumped.push((network_id, organization_id));
    }

    Ok(bumped)
}
