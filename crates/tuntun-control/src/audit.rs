use serde_json::json;
use sqlx::PgPool;

pub async fn log(
    pool: &PgPool,
    organization_id: Option<&str>,
    actor: Option<&str>,
    action: &str,
    target: Option<&str>,
    metadata: serde_json::Value,
    trace_id: Option<&str>,
) {
    let _ = sqlx::query(
        "INSERT INTO audit_log (organization_id, actor, action, target, metadata, trace_id) \
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(organization_id)
    .bind(actor)
    .bind(action)
    .bind(target)
    .bind(&metadata)
    .bind(trace_id)
    .execute(pool)
    .await
    .map_err(|e| tracing::warn!(?e, "audit log insert failed"));

    // Also emit a structured event so it shows up in log aggregation
    // even if the DB is unreachable.
    tracing::info!(
        target = "audit",
        action,
        ?organization_id,
        ?actor,
        target_id = ?target,
        metadata = %json!(metadata),
        "audit"
    );
}
