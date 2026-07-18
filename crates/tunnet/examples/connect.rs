//! Enroll (or reuse state), open a stream to a peer, and exchange bytes.
//!
//! ```bash
//! cargo run -p tunnet --example connect -- \
//!   --state-dir ./tunnet-state \
//!   --peer 10.0.0.5 \
//!   --port 8080
//! ```

use std::env;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tunnet::TunnetNode;

#[tokio::main]
async fn main() -> tunnet::Result<()> {
    tracing_subscriber::fmt::init();

    let state_dir = env::var("TUNNET_STATE_DIR").unwrap_or_else(|_| "./tunnet-state".into());
    let peer = env::args().nth(1).unwrap_or_else(|| "10.0.0.5".into());
    let port: u16 = env::args()
        .nth(2)
        .and_then(|s| s.parse().ok())
        .unwrap_or(8080);

    let mut builder = TunnetNode::builder()
        .hostname("connect-example")
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
    println!("endpoint={} ip={:?}", node.endpoint_id(), node.self_ip());

    let mut stream = node.open_stream(&peer, port).await?;
    stream.write_all(b"hello from tunnet sdk\n").await?;
    let mut buf = vec![0u8; 4096];
    let n = stream.read(&mut buf).await?;
    println!(
        "received {} bytes: {:?}",
        n,
        String::from_utf8_lossy(&buf[..n])
    );

    node.shutdown().await;
    Ok(())
}
