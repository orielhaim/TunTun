# Rust SDK

The Rust SDK (`tunnet` on crates.io) embeds a Tunnet mesh node in any Tokio application. Use it to open encrypted streams to peers, accept inbound connections, transfer files, and expose services on the overlay.

## Installation

```toml
[dependencies]
tunnet = "0.2"
tokio = { version = "1", features = ["full"] }
```

Optional Cargo features:

| Feature | Default | What it enables |
|---------|---------|-----------------|
| `managed` | yes | Control-plane enrollment and sync |
| `direct` | no | Direct-mode type helpers |
| `send` | no | File transfer APIs |
| `serve` | no | Mesh reverse-proxy (`serve`) APIs |

```toml
# Example: managed mesh + file transfer
tunnet = { version = "0.2", features = ["managed", "send"] }
```

## Quick start

```rust
use tunnet::TunnetNode;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[tokio::main]
async fn main() -> tunnet::Result<()> {
    let node = TunnetNode::builder()
        .hostname("my-service")
        .state_dir("/var/lib/my-app/tunnet")
        .api_key("tnnt_key_...")
        .organization_id("org_...")
        .network_id("00000000-0000-0000-0000-000000000000")
        .control_url("https://cp.tunnet.io")
        .management_url("https://api.tunnet.io")
        .standalone(true)
        .start()
        .await?;

    println!("endpoint={} ip={:?}", node.endpoint_id(), node.self_ip());

    let mut stream = node.open_stream("api-server", 8080).await?;
    stream.write_all(b"hello\n").await?;
    let mut buf = [0u8; 1024];
    let n = stream.read(&mut buf).await?;
    println!("{}", String::from_utf8_lossy(&buf[..n]));

    node.shutdown().await;
    Ok(())
}
```

## Next steps

- [TunnetNode](/sdk/rust/node) - builder, enrollment, peers
- [Streams](/sdk/rust/streams) - outbound streams and inbound listeners
- [File Transfer](/sdk/rust/file-transfer) - send and receive files (`send` feature)
- [API reference](https://docs.rs/tunnet) on docs.rs
