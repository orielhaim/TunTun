# tunnet

Embed a Tunnet mesh node inside any Rust application.

[Documentation](https://docs.tunnet.io/sdk/rust/) · [API reference](https://docs.rs/tunnet) · [Homepage](https://tunnet.io)

## Install

```toml
[dependencies]
tunnet = "0.2"
tokio = { version = "1", features = ["full"] }
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

    let mut stream = node.open_stream("10.0.0.5", 8080).await?;
    stream.write_all(b"hello").await?;
    Ok(())
}
```

Inbound streams:

```rust
let mut listener = node.stream_listener().await?;
let (stream, peer, header) = listener.accept().await?;
```

## Features

| Feature | Default | Description |
|---------|---------|-------------|
| `managed` | yes | Control-plane enrollment and sync |
| `direct` | no | Direct / local-first mode type re-exports |
| `send` | no | File transfer APIs |
| `serve` | no | Mesh reverse-proxy APIs |

## License

Apache-2.0
