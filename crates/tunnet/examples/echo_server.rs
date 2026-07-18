//! Accept inbound mesh streams and echo bytes back.
//!
//! ```bash
//! cargo run -p tunnet --example echo_server
//! ```

use std::env;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tunnet::TunnetNode;

#[tokio::main]
async fn main() -> tunnet::Result<()> {
    tracing_subscriber::fmt::init();

    let state_dir = env::var("TUNNET_STATE_DIR").unwrap_or_else(|_| "./tunnet-state".into());

    let mut builder = TunnetNode::builder()
        .hostname("echo-server")
        .state_dir(state_dir)
        .standalone(true);

    if let Ok(api_key) = env::var("TUNNET_API_KEY") {
        builder = builder
            .api_key(api_key)
            .organization_id(env::var("TUNNET_ORG_ID").expect("TUNNET_ORG_ID"))
            .network_id(env::var("TUNNET_NETWORK_ID").expect("TUNNET_NETWORK_ID"))
            .control_url(
                env::var("CONTROL_PLANE_URL").unwrap_or_else(|_| "https://cp.tunnet.io".into()),
            )
            .management_url(
                env::var("MANAGEMENT_URL").unwrap_or_else(|_| "https://api.tunnet.io".into()),
            );
    }

    let node = builder.start().await?;
    println!(
        "echo server endpoint={} ip={:?}",
        node.endpoint_id(),
        node.self_ip()
    );

    let mut listener = node.stream_listener().await?;
    loop {
        let (mut stream, peer, header) = listener.accept().await?;
        println!(
            "accepted from {} host={} port={}",
            peer.endpoint_id, header.host, header.dst_port
        );
        tokio::spawn(async move {
            let mut buf = vec![0u8; 4096];
            loop {
                match stream.read(&mut buf).await {
                    Ok(0) => break,
                    Ok(n) => {
                        if stream.write_all(&buf[..n]).await.is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
        });
    }
}
