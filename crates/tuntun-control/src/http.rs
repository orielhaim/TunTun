use std::sync::Arc;

use axum::body::Body;
use axum::extract::{
    ConnectInfo, State, WebSocketUpgrade,
    ws::{Message, WebSocket},
};
use axum::http::{Request, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::net::SocketAddr;
use tower_http::trace::TraceLayer;
use tuntun_common::{
    EndpointSnapshot, EnrollRequest, EnrollResponse, PollRequest, RegisterRequest,
    ws::{ClientMsg, ServerMsg},
};

use crate::auth::{AuthError, authenticate};
use crate::state::{AppState, SharedState};

pub async fn serve(state: SharedState) -> anyhow::Result<()> {
    let public = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/v1/enroll", post(enroll_handler))
        .route("/v1/register", post(register_handler))
        .route("/v1/poll", post(poll_handler))
        .route("/v1/ws", get(ws_handler))
        .with_state(state.clone())
        .layer(TraceLayer::new_for_http());

    let internal = Router::new()
        .route("/metrics", get(metrics_handler))
        .route("/ready", get(ready_handler))
        .with_state(state.clone());

    let public_listener = tokio::net::TcpListener::bind(&state.args.bind).await?;
    let internal_listener = tokio::net::TcpListener::bind(&state.args.internal_bind).await?;

    tracing::info!(bind = %state.args.bind, internal = %state.args.internal_bind, "listening");

    let public_srv = axum::serve(
        public_listener,
        public.into_make_service_with_connect_info::<SocketAddr>(),
    );
    let internal_srv = axum::serve(internal_listener, internal);

    tokio::try_join!(public_srv, internal_srv)?;
    Ok(())
}

// ---------- helpers ----------

fn err(code: StatusCode, msg: &str) -> Response {
    (code, Json(json!({ "error": msg }))).into_response()
}

// ---------- enroll ----------

async fn enroll_handler(
    State(state): State<SharedState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(req): Json<EnrollRequest>,
) -> Response {
    let outcome = enroll_inner(&state, req, Some(addr.ip())).await;
    match outcome {
        Ok(resp) => (StatusCode::OK, Json(resp)).into_response(),
        Err((code, msg)) => {
            state
                .metrics
                .http_requests
                .with_label_values(&["enroll", code.as_str()])
                .inc();
            err(code, &msg)
        }
    }
}

async fn enroll_inner(
    state: &SharedState,
    req: EnrollRequest,
    public_ip: Option<std::net::IpAddr>,
) -> Result<EnrollResponse, (StatusCode, String)> {
    tuntun_common::validate_endpoint_id(&req.endpoint_id)
        .map_err(|_| (StatusCode::BAD_REQUEST, "invalid endpoint_id".into()))?;
    if req.hostname.len() > 253 {
        return Err((StatusCode::BAD_REQUEST, "hostname too long".into()));
    }

    let token_hash = crate::enrollment::hash_token(&req.enrollment_token);

    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("db: {e}")))?;

    let row: Option<(String, uuid::Uuid)> = sqlx::query_as(
        "UPDATE enrollment_tokens et SET used_at = now() \
         FROM networks n \
         WHERE et.token_hash = $1 AND et.network_id = n.id \
           AND et.used_at IS NULL AND et.expires_at > now() \
         RETURNING n.organization_id, et.network_id",
    )
    .bind(&token_hash)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("db: {e}")))?;

    let (organization_id, network_id) = row.ok_or_else(|| {
        state
            .metrics
            .auth_failures
            .with_label_values(&["bad_enroll_token"])
            .inc();
        (
            StatusCode::UNAUTHORIZED,
            "invalid or expired enrollment token".into(),
        )
    })?;

    tx.commit()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("db: {e}")))?;

    let device_type = req
        .metadata
        .as_ref()
        .and_then(|m| m.get("kind"))
        .and_then(|k| k.as_str())
        .unwrap_or("agent")
        .to_string();

    let resp = crate::register::register_device(
        &state.pool,
        &state.policy_key,
        crate::register::RegisterDeviceParams {
            endpoint_id: req.endpoint_id.clone(),
            organization_id,
            network_id,
            hostname: req.hostname.clone(),
            os: req.os.clone(),
            agent_version: req.agent_version.clone(),
            device_type,
            metadata: req.metadata.clone(),
            public_ip,
        },
    )
    .await?;

    state
        .metrics
        .http_requests
        .with_label_values(&["enroll", "200"])
        .inc();
    Ok(resp)
}

async fn register_handler(State(state): State<SharedState>, req: Request<Body>) -> Response {
    let path = req.uri().path().to_string();
    let method = req.method().as_str().to_string();
    let auth = match authenticate(&state, req, &method, &path).await {
        Ok(a) => a,
        Err(AuthError(c, m)) => return err(c, m),
    };
    let parsed: RegisterRequest = match serde_json::from_slice(&auth.body) {
        Ok(v) => v,
        Err(_) => return err(StatusCode::BAD_REQUEST, "invalid json"),
    };
    if parsed.endpoint_id != auth.endpoint_id {
        return err(StatusCode::BAD_REQUEST, "endpoint_id mismatch");
    }

    let _ = sqlx::query("UPDATE devices SET last_seen = now() WHERE endpoint_id = $1")
        .bind(&auth.endpoint_id)
        .execute(&state.pool)
        .await;

    let metadata = parsed.metadata.unwrap_or_else(|| {
        serde_json::json!({
            "hostname": parsed.hostname,
            "agentVersion": parsed.agent_version,
            "reportedAt": chrono::Utc::now().to_rfc3339(),
        })
    });
    let pool = state.pool.clone();
    let endpoint_id = auth.endpoint_id.clone();
    let hostname = parsed.hostname.clone();
    let agent_version = parsed.agent_version.clone();
    tokio::spawn(async move {
        if let Err(e) = crate::device_metadata::merge_device_metadata(
            &pool,
            &endpoint_id,
            &hostname,
            &agent_version,
            "",
            metadata,
        )
        .await
        {
            tracing::warn!(endpoint_id = %endpoint_id, error = %e, "metadata update failed");
        }
    });

    let snap = match crate::snapshot::build_endpoint_snapshot(
        &state.pool,
        &state.policy_key,
        &auth.endpoint_id,
    )
    .await
    {
        Ok(s) => s,
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &format!("snapshot: {e}")),
    };

    state
        .metrics
        .http_requests
        .with_label_values(&["register", "200"])
        .inc();
    (StatusCode::OK, Json(snap)).into_response()
}

async fn poll_handler(State(state): State<SharedState>, req: Request<Body>) -> Response {
    let path = req.uri().path().to_string();
    let method = req.method().as_str().to_string();
    let auth = match authenticate(&state, req, &method, &path).await {
        Ok(a) => a,
        Err(AuthError(c, m)) => return err(c, m),
    };
    let parsed: PollRequest = match serde_json::from_slice(&auth.body) {
        Ok(v) => v,
        Err(_) => return err(StatusCode::BAD_REQUEST, "invalid json"),
    };
    if parsed.endpoint_id != auth.endpoint_id {
        return err(StatusCode::BAD_REQUEST, "endpoint_id mismatch");
    }

    let _ = sqlx::query("UPDATE devices SET last_seen = now() WHERE endpoint_id = $1")
        .bind(&auth.endpoint_id)
        .execute(&state.pool)
        .await;

    let snap: EndpointSnapshot = match crate::snapshot::build_endpoint_snapshot(
        &state.pool,
        &state.policy_key,
        &auth.endpoint_id,
    )
    .await
    {
        Ok(s) => s,
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &format!("snapshot: {e}")),
    };

    state
        .metrics
        .http_requests
        .with_label_values(&["poll", "200"])
        .inc();
    (StatusCode::OK, Json(snap)).into_response()
}

async fn ws_handler(
    State(state): State<SharedState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    req: Request<Body>,
) -> Response {
    let path = "/v1/ws".to_string();
    let method = "GET".to_string();

    let headers = req.headers().clone();
    let endpoint_id = match headers
        .get(tuntun_common::HDR_ENDPOINT_ID)
        .and_then(|v| v.to_str().ok())
    {
        Some(v) => v.to_string(),
        None => return err(StatusCode::UNAUTHORIZED, "missing X-Endpoint-Id"),
    };
    let ts: i64 = match headers
        .get(tuntun_common::HDR_TIMESTAMP)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok())
    {
        Some(t) => t,
        None => return err(StatusCode::UNAUTHORIZED, "missing X-Timestamp"),
    };
    let sig = match headers
        .get(tuntun_common::HDR_SIGNATURE)
        .and_then(|v| v.to_str().ok())
    {
        Some(s) => s.to_string(),
        None => return err(StatusCode::UNAUTHORIZED, "missing X-Endpoint-Signature"),
    };

    if (chrono::Utc::now().timestamp() - ts).abs() > tuntun_common::MAX_SKEW_SECS {
        return err(StatusCode::UNAUTHORIZED, "stale timestamp");
    }
    let vk = match tuntun_common::signing::verifying_key_from_hex(&endpoint_id) {
        Ok(v) => v,
        Err(_) => return err(StatusCode::BAD_REQUEST, "invalid pubkey"),
    };
    if tuntun_common::signing::verify(&vk, &method, &path, ts, &[], &sig).is_err() {
        return err(StatusCode::UNAUTHORIZED, "bad signature");
    }

    let device: Option<String> =
        match sqlx::query_scalar("SELECT organization_id FROM devices WHERE endpoint_id = $1")
            .bind(&endpoint_id)
            .fetch_optional(&state.pool)
            .await
        {
            Ok(r) => r,
            Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &format!("db: {e}")),
        };
    let organization_id = match device {
        Some(d) => d,
        None => return err(StatusCode::UNAUTHORIZED, "unknown device"),
    };

    let network_ids: Vec<uuid::Uuid> = match sqlx::query_scalar(
        "SELECT network_id FROM network_memberships WHERE endpoint_id = $1 AND status = 'active'",
    )
    .bind(&endpoint_id)
    .fetch_all(&state.pool)
    .await
    {
        Ok(r) => r,
        Err(e) => return err(StatusCode::INTERNAL_SERVER_ERROR, &format!("db: {e}")),
    };
    if network_ids.is_empty() {
        return err(StatusCode::UNAUTHORIZED, "unknown device");
    }

    // Perform the actual upgrade.
    let upgrade = match WebSocketUpgrade::from_request(req, &state).await {
        Ok(u) => u,
        Err(e) => return e.into_response(),
    };

    upgrade.on_upgrade(move |socket| async move {
        run_ws(
            state,
            socket,
            endpoint_id,
            organization_id,
            network_ids,
            Some(addr.ip()),
        )
        .await;
    })
}

async fn run_ws(
    state: SharedState,
    socket: WebSocket,
    endpoint_id: String,
    organization_id: String,
    network_ids: Vec<uuid::Uuid>,
    public_ip: Option<std::net::IpAddr>,
) {
    tracing::info!(%endpoint_id, ?public_ip, "ws connected");
    let _ = organization_id;

    if let Err(e) =
        crate::presence::mark_agent_connected(&state.pool, &endpoint_id, public_ip).await
    {
        tracing::warn!(?e, %endpoint_id, "failed to mark agent connected");
    }

    let (mut ws_tx, mut ws_rx) = socket.split();
    let mut rx = state
        .ws_hub
        .register(endpoint_id.clone(), network_ids.clone());

    if let Ok(snap) =
        crate::snapshot::build_endpoint_snapshot(&state.pool, &state.policy_key, &endpoint_id).await
    {
        let msg = ServerMsg::Snapshot(snap);
        if let Ok(txt) = serde_json::to_string(&msg) {
            let _ = ws_tx.send(Message::Text(txt)).await;
        }
    }

    let hub = state.ws_hub.clone();
    let ep_for_cleanup = endpoint_id.clone();

    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let Ok(txt) = serde_json::to_string(&msg) else {
                continue;
            };
            if ws_tx.send(Message::Text(txt)).await.is_err() {
                break;
            }
        }
    });

    // Ping loop + inbound reader.
    let pool = state.pool.clone();
    let ep = endpoint_id.clone();
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_rx.next().await {
            match msg {
                Message::Text(txt) => {
                    if let Ok(cm) = serde_json::from_str::<ClientMsg>(&txt) {
                        match cm {
                            ClientMsg::Heartbeat { .. } => {
                                if let Err(e) = crate::presence::record_heartbeat(&pool, &ep).await
                                {
                                    tracing::warn!(?e, %ep, "heartbeat update failed");
                                }
                            }
                            ClientMsg::Hello { .. } | ClientMsg::Pong { .. } => {}
                        }
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = send_task => {},
        _ = recv_task => {},
    }

    hub.unregister(&ep_for_cleanup, &network_ids);
    if let Err(e) = crate::presence::mark_agent_disconnected(&state.pool, &ep_for_cleanup).await {
        tracing::warn!(?e, %ep_for_cleanup, "failed to mark agent disconnected");
    }
    tracing::info!(%ep_for_cleanup, "ws disconnected");
}

async fn metrics_handler(State(state): State<SharedState>) -> impl IntoResponse {
    (
        StatusCode::OK,
        [("content-type", "text/plain; version=0.0.4")],
        state.metrics.render(),
    )
}

async fn ready_handler(State(state): State<SharedState>) -> impl IntoResponse {
    // Cheap ping to DB.
    let ok = sqlx::query("SELECT 1").execute(&state.pool).await.is_ok();
    if ok {
        (StatusCode::OK, "ready")
    } else {
        (StatusCode::SERVICE_UNAVAILABLE, "db down")
    }
}

use axum::extract::FromRequest;

#[allow(dead_code)]
fn _touch(_s: Arc<AppState>) {}
