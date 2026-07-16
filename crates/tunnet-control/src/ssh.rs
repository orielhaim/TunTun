//! Agent-facing SSH session recording upload + list endpoints.

use axum::Json;
use axum::body::Body;
use axum::extract::{Path, Query, Request, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::auth::{AuthError, authenticate, authenticate_with_limit};
use crate::state::SharedState;

fn err(code: StatusCode, msg: &str) -> Response {
    (code, Json(json!({ "error": msg }))).into_response()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadSshRecordingBody {
    pub session_id: String,
    pub cast_text: String,
    pub content_sha256: String,
}

pub async fn upload_ssh_recording_handler(
    State(state): State<SharedState>,
    req: Request<Body>,
) -> Response {
    let path = req.uri().path().to_string();
    let method = req.method().as_str().to_string();
    let auth = match authenticate_with_limit(&state, req, &method, &path, 17 * 1024 * 1024).await {
        Ok(a) => a,
        Err(AuthError(c, m)) => return err(c, m),
    };
    let body: UploadSshRecordingBody = match serde_json::from_slice(&auth.body) {
        Ok(v) => v,
        Err(_) => return err(StatusCode::BAD_REQUEST, "invalid json"),
    };

    if body.cast_text.len() > 16 * 1024 * 1024 {
        return err(StatusCode::PAYLOAD_TOO_LARGE, "recording too large");
    }
    if body.content_sha256.len() != 64
        || !body.content_sha256.chars().all(|c| c.is_ascii_hexdigit())
    {
        return err(StatusCode::BAD_REQUEST, "invalid contentSha256");
    }
    let session_id: Uuid = match body.session_id.parse() {
        Ok(id) => id,
        Err(_) => return err(StatusCode::BAD_REQUEST, "invalid sessionId"),
    };

    let session: Option<(String, Uuid, Uuid)> = match sqlx::query_as(
        "SELECT organization_id, network_id, id FROM ssh_sessions WHERE id = $1",
    )
    .bind(session_id)
    .fetch_optional(&state.pool)
    .await
    {
        Ok(r) => r,
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &format!("db: {e}")),
    };
    let Some((org_id, network_id, _)) = session else {
        return err(StatusCode::NOT_FOUND, "session not found");
    };

    // Uploader must be a member of the session's network.
    let member: Option<(i32,)> = match sqlx::query_as(
        "SELECT 1 FROM network_memberships \
         WHERE endpoint_id = $1 AND network_id = $2 AND status = 'active'",
    )
    .bind(&auth.endpoint_id)
    .bind(network_id)
    .fetch_optional(&state.pool)
    .await
    {
        Ok(r) => r,
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &format!("db: {e}")),
    };
    if member.is_none() {
        return err(StatusCode::FORBIDDEN, "not a member of session network");
    }

    let byte_size = body.cast_text.len() as i32;
    let id: Uuid = match sqlx::query_scalar(
        "INSERT INTO ssh_recordings \
           (session_id, organization_id, network_id, recorder_endpoint_id, \
            cast_text, content_sha256, byte_size) \
         VALUES ($1, $2, $3, $4, $5, $6, $7) \
         ON CONFLICT (session_id) DO UPDATE SET \
           recorder_endpoint_id = EXCLUDED.recorder_endpoint_id, \
           cast_text = EXCLUDED.cast_text, \
           content_sha256 = EXCLUDED.content_sha256, \
           byte_size = EXCLUDED.byte_size \
         RETURNING id",
    )
    .bind(session_id)
    .bind(&org_id)
    .bind(network_id)
    .bind(&auth.endpoint_id)
    .bind(&body.cast_text)
    .bind(&body.content_sha256)
    .bind(byte_size)
    .fetch_one(&state.pool)
    .await
    {
        Ok(id) => id,
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &format!("db: {e}")),
    };

    let _ = sqlx::query("UPDATE ssh_sessions SET recorded = true WHERE id = $1")
        .bind(session_id)
        .execute(&state.pool)
        .await;

    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "id": id.to_string(),
            "sessionId": session_id.to_string(),
        })),
    )
        .into_response()
}

#[derive(Debug, Deserialize)]
pub struct ListSessionsQuery {
    #[serde(default = "default_limit")]
    pub limit: i64,
    #[serde(default)]
    pub status: Option<String>,
}

fn default_limit() -> i64 {
    50
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct SessionRow {
    id: Uuid,
    network_id: Uuid,
    src_endpoint_id: String,
    dst_endpoint_id: String,
    src_hostname: Option<String>,
    dst_hostname: Option<String>,
    target_user: String,
    status: String,
    recorded: bool,
    started_at: chrono::DateTime<chrono::Utc>,
    ended_at: Option<chrono::DateTime<chrono::Utc>>,
    duration_ms: Option<i32>,
}

pub async fn list_ssh_sessions_handler(
    State(state): State<SharedState>,
    Query(query): Query<ListSessionsQuery>,
    req: Request<Body>,
) -> Response {
    let path = req.uri().path().to_string();
    let method = req.method().as_str().to_string();
    let auth = match authenticate(&state, req, &method, &path).await {
        Ok(a) => a,
        Err(AuthError(c, m)) => return err(c, m),
    };

    let limit = query.limit.clamp(1, 200);
    let rows: Vec<SessionRow> = if let Some(status) = query.status.as_deref() {
        match sqlx::query_as(
            "SELECT s.id, s.network_id, s.src_endpoint_id, s.dst_endpoint_id, \
                    s.src_hostname, s.dst_hostname, s.target_user, s.status, s.recorded, \
                    s.started_at, s.ended_at, s.duration_ms \
             FROM ssh_sessions s \
             JOIN network_memberships nm ON nm.network_id = s.network_id \
               AND nm.endpoint_id = $1 AND nm.status = 'active' \
             WHERE s.status = $2 \
             ORDER BY s.started_at DESC LIMIT $3",
        )
        .bind(&auth.endpoint_id)
        .bind(status)
        .bind(limit)
        .fetch_all(&state.pool)
        .await
        {
            Ok(r) => r,
            Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &format!("db: {e}")),
        }
    } else {
        match sqlx::query_as(
            "SELECT s.id, s.network_id, s.src_endpoint_id, s.dst_endpoint_id, \
                    s.src_hostname, s.dst_hostname, s.target_user, s.status, s.recorded, \
                    s.started_at, s.ended_at, s.duration_ms \
             FROM ssh_sessions s \
             JOIN network_memberships nm ON nm.network_id = s.network_id \
               AND nm.endpoint_id = $1 AND nm.status = 'active' \
             ORDER BY s.started_at DESC LIMIT $2",
        )
        .bind(&auth.endpoint_id)
        .bind(limit)
        .fetch_all(&state.pool)
        .await
        {
            Ok(r) => r,
            Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &format!("db: {e}")),
        }
    };

    (StatusCode::OK, Json(json!({ "sessions": rows }))).into_response()
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct RecordingRow {
    id: Uuid,
    session_id: Uuid,
    network_id: Uuid,
    recorder_endpoint_id: String,
    content_sha256: String,
    byte_size: i32,
    duration_ms: Option<i32>,
    created_at: chrono::DateTime<chrono::Utc>,
    src_hostname: Option<String>,
    dst_hostname: Option<String>,
    target_user: String,
}

pub async fn list_ssh_recordings_handler(
    State(state): State<SharedState>,
    Query(query): Query<ListSessionsQuery>,
    req: Request<Body>,
) -> Response {
    let path = req.uri().path().to_string();
    let method = req.method().as_str().to_string();
    let auth = match authenticate(&state, req, &method, &path).await {
        Ok(a) => a,
        Err(AuthError(c, m)) => return err(c, m),
    };
    let limit = query.limit.clamp(1, 200);
    let rows: Vec<RecordingRow> = match sqlx::query_as(
        "SELECT r.id, r.session_id, r.network_id, r.recorder_endpoint_id, \
                r.content_sha256, r.byte_size, r.duration_ms, r.created_at, \
                s.src_hostname, s.dst_hostname, s.target_user \
         FROM ssh_recordings r \
         JOIN ssh_sessions s ON s.id = r.session_id \
         JOIN network_memberships nm ON nm.network_id = r.network_id \
           AND nm.endpoint_id = $1 AND nm.status = 'active' \
         ORDER BY r.created_at DESC LIMIT $2",
    )
    .bind(&auth.endpoint_id)
    .bind(limit)
    .fetch_all(&state.pool)
    .await
    {
        Ok(r) => r,
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &format!("db: {e}")),
    };

    (StatusCode::OK, Json(json!({ "recordings": rows }))).into_response()
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct CastRow {
    cast_text: String,
    content_sha256: String,
    session_id: Uuid,
}

pub async fn get_ssh_recording_cast_handler(
    State(state): State<SharedState>,
    Path(session_id): Path<String>,
    req: Request<Body>,
) -> Response {
    let path = req.uri().path().to_string();
    let method = req.method().as_str().to_string();
    let auth = match authenticate(&state, req, &method, &path).await {
        Ok(a) => a,
        Err(AuthError(c, m)) => return err(c, m),
    };
    let sid: Uuid = match session_id.parse() {
        Ok(id) => id,
        Err(_) => return err(StatusCode::BAD_REQUEST, "invalid session id"),
    };

    let row: Option<CastRow> = match sqlx::query_as(
        "SELECT r.cast_text, r.content_sha256, r.session_id \
         FROM ssh_recordings r \
         JOIN network_memberships nm ON nm.network_id = r.network_id \
           AND nm.endpoint_id = $1 AND nm.status = 'active' \
         WHERE r.session_id = $2 \
         ORDER BY r.created_at DESC LIMIT 1",
    )
    .bind(&auth.endpoint_id)
    .bind(sid)
    .fetch_optional(&state.pool)
    .await
    {
        Ok(r) => r,
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &format!("db: {e}")),
    };
    let Some(row) = row else {
        return err(StatusCode::NOT_FOUND, "recording not found");
    };

    (
        StatusCode::OK,
        Json(json!({
            "sessionId": row.session_id.to_string(),
            "contentSha256": row.content_sha256,
            "castText": row.cast_text,
        })),
    )
        .into_response()
}
