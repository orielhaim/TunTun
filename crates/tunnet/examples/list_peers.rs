//! List peers currently known to the local overlay.
//!
//! ```bash
//! cargo run -p tunnet --example list_peers
//! ```

use std::env;

use tunnet::TunnetNode;

#[tokio::main]
async fn main() -> tunnet::Result<()> {
    tracing_subscriber::fmt::init();

    let state_dir = env::var("TUNNET_STATE_DIR").unwrap_or_else(|_| "./tunnet-state".into());

    let mut builder = TunnetNode::builder()
        .hostname("list-peers")
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

    let peers = node.list_peers().await?;
    if peers.is_empty() {
        println!("no peers yet");
    } else {
        for p in peers {
            println!(
                "{:<16} {:<24} {} {:?}",
                p.ip, p.hostname, p.endpoint_id, p.tags
            );
        }
    }

    node.shutdown().await;
    Ok(())
}
