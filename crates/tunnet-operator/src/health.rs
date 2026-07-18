use axum::{Router, http::StatusCode, routing::get};
use std::net::SocketAddr;

pub fn router() -> Router {
    Router::new()
        .route("/healthz", get(|| async { StatusCode::OK }))
        .route("/readyz", get(|| async { StatusCode::OK }))
}

pub async fn serve(addr: SocketAddr) -> anyhow::Result<()> {
    let app = router();
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!(%addr, "health server listening");
    axum::serve(listener, app).await?;
    Ok(())
}
