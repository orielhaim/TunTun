//! Internal admin API for management service (HMAC-protected).

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::{Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Serialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::service_auth::{ServiceAuth, ServiceAuthError};
use crate::ws_hub::WsHub;

#[derive(Clone)]
pub struct AdminState {
    pub pool: PgPool,
    pub ws_hub: WsHub,
    pub service_auth: ServiceAuth,
    pub listen_connected: Arc<AtomicBool>,
    pub version: &'static str,
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    version: &'static str,
    ws_connections: i64,
    listen_connected: bool,
}

#[derive(Serialize)]
struct ReadyResponse {
    ready: bool,
    db: bool,
    listen: bool,
}

#[derive(Serialize)]
struct ValidateNetworkResponse {
    network_id: Uuid,
    organization_id: String,
    version: i64,
    device_count: i64,
}

pub async fn serve(bind: &str, state: AdminState) -> anyhow::Result<()> {
    let router = Router::new()
        .route("/internal/v1/health", get(health_handler))
        .route("/internal/v1/ready", get(ready_handler))
        .route(
            "/internal/v1/networks/:network_id/validate",
            post(validate_network_handler),
        )
        .with_state(Arc::new(state));

    let listener = tokio::net::TcpListener::bind(bind).await?;
    tracing::info!(%bind, "admin API listening");
    axum::serve(listener, router).await?;
    Ok(())
}

async fn health_handler(
    State(state): State<Arc<AdminState>>,
    req: Request<axum::body::Body>,
) -> Response {
    if let Err(resp) = verify_service(&state, req).await {
        return resp;
    }

    Json(HealthResponse {
        status: "ok",
        version: state.version,
        ws_connections: state.ws_hub.connection_count(),
        listen_connected: state.listen_connected.load(Ordering::Relaxed),
    })
    .into_response()
}

async fn ready_handler(
    State(state): State<Arc<AdminState>>,
    req: Request<axum::body::Body>,
) -> Response {
    if let Err(resp) = verify_service(&state, req).await {
        return resp;
    }

    let db_ok = sqlx::query("SELECT 1").execute(&state.pool).await.is_ok();
    let listen_ok = state.listen_connected.load(Ordering::Relaxed);
    Json(ReadyResponse {
        ready: db_ok && listen_ok,
        db: db_ok,
        listen: listen_ok,
    })
    .into_response()
}

async fn validate_network_handler(
    State(state): State<Arc<AdminState>>,
    Path(network_id): Path<Uuid>,
    req: Request<axum::body::Body>,
) -> Response {
    if let Err(resp) = verify_service(&state, req).await {
        return resp;
    }

    let row: Option<(String, i64)> =
        match sqlx::query_as("SELECT organization_id, version FROM networks WHERE id = $1")
            .bind(network_id)
            .fetch_optional(&state.pool)
            .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::error!(?e, "db error in validate_network");
                return (StatusCode::INTERNAL_SERVER_ERROR, "db error").into_response();
            }
        };

    let Some((organization_id, version)) = row else {
        return (StatusCode::NOT_FOUND, "network not found").into_response();
    };

    let device_count: (i64,) = match sqlx::query_as(
        "SELECT COUNT(*)::bigint FROM network_memberships WHERE network_id = $1",
    )
    .bind(network_id)
    .fetch_one(&state.pool)
    .await
    {
        Ok(c) => c,
        Err(e) => {
            tracing::error!(?e, "db error counting devices");
            return (StatusCode::INTERNAL_SERVER_ERROR, "db error").into_response();
        }
    };

    (
        StatusCode::OK,
        Json(ValidateNetworkResponse {
            network_id,
            organization_id,
            version,
            device_count: device_count.0,
        }),
    )
        .into_response()
}

async fn verify_service(
    state: &AdminState,
    req: Request<axum::body::Body>,
) -> Result<(), Response> {
    let method = req.method().to_string();
    let path = req.uri().path().to_string();
    let headers = req.headers().clone();
    let body = axum::body::to_bytes(req.into_body(), 1024 * 1024)
        .await
        .map_err(|_| StatusCode::BAD_REQUEST.into_response())?;

    state
        .service_auth
        .verify(&method, &path, &headers, &Bytes::from(body))
        .await
        .map_err(|e: ServiceAuthError| e.into_response())
}
