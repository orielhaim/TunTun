use std::time::Duration;

use anyhow::Context;
use chrono::Utc;
use ed25519_dalek::SigningKey;
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tuntun_common::{
    HDR_ENDPOINT_ID, HDR_SIGNATURE, HDR_TIMESTAMP, signing,
    ws::{ClientMsg, ServerMsg},
};

pub struct WsChannel {
    pub rx: tokio::sync::mpsc::Receiver<ServerMsg>,
    pub tx: tokio::sync::mpsc::Sender<ClientMsg>,
}

pub fn spawn(control_url: String, endpoint_id: String, signing_key: SigningKey) -> WsChannel {
    let (server_tx, server_rx) = tokio::sync::mpsc::channel::<ServerMsg>(64);
    let (client_tx, client_rx) = tokio::sync::mpsc::channel::<ClientMsg>(64);

    tokio::spawn(async move {
        run(control_url, endpoint_id, signing_key, server_tx, client_rx).await;
    });

    WsChannel {
        rx: server_rx,
        tx: client_tx,
    }
}

async fn run(
    control_url: String,
    endpoint_id: String,
    signing_key: SigningKey,
    server_tx: tokio::sync::mpsc::Sender<ServerMsg>,
    mut client_rx: tokio::sync::mpsc::Receiver<ClientMsg>,
) {
    let mut backoff = Duration::from_secs(1);
    loop {
        match connect_once(&control_url, &endpoint_id, &signing_key).await {
            Ok(mut ws) => {
                backoff = Duration::from_secs(1);
                tracing::info!("ws connected to control plane");
                loop {
                    tokio::select! {
                        maybe_msg = ws.next() => {
                            let Some(res) = maybe_msg else {
                                tracing::warn!("ws stream ended"); break;
                            };
                            match res {
                                Ok(Message::Text(t)) => {
                                    match serde_json::from_str::<ServerMsg>(&t) {
                                        Ok(m) => { let _ = server_tx.send(m).await; }
                                        Err(e) => tracing::warn!(?e, "ws server msg parse"),
                                    }
                                }
                                Ok(Message::Ping(p)) => { let _ = ws.send(Message::Pong(p)).await; }
                                Ok(Message::Close(_)) => break,
                                Ok(_) => {}
                                Err(e) => { tracing::warn!(?e, "ws error"); break; }
                            }
                        }
                        maybe_out = client_rx.recv() => {
                            let Some(m) = maybe_out else { break };
                            if let Ok(t) = serde_json::to_string(&m) {
                                if ws.send(Message::Text(t)).await.is_err() { break; }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                tracing::warn!(?e, wait_ms = backoff.as_millis(), "ws connect failed");
            }
        }
        let jitter = Duration::from_millis(rand::random::<u64>() % 500);
        tokio::time::sleep(backoff + jitter).await;
        backoff = (backoff * 2).min(Duration::from_secs(60));
    }
}

async fn connect_once(
    control_url: &str,
    endpoint_id: &str,
    signing_key: &SigningKey,
) -> anyhow::Result<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
> {
    let ws_url = if let Some(rest) = control_url.strip_prefix("https://") {
        format!("wss://{rest}/v1/ws")
    } else if let Some(rest) = control_url.strip_prefix("http://") {
        format!("ws://{rest}/v1/ws")
    } else {
        anyhow::bail!("control url must start with http:// or https://");
    };

    let ts = Utc::now().timestamp();
    let sig = signing::sign(signing_key, "GET", "/v1/ws", ts, &[]);

    let mut req = ws_url.into_client_request().context("build ws request")?;
    req.headers_mut()
        .insert(HDR_ENDPOINT_ID, endpoint_id.parse()?);
    req.headers_mut()
        .insert(HDR_TIMESTAMP, ts.to_string().parse()?);
    req.headers_mut().insert(HDR_SIGNATURE, sig.parse()?);

    let (ws, _resp) = tokio_tungstenite::connect_async(req).await?;
    Ok(ws)
}
