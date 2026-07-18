# TunnetNode (Rust)

`TunnetNode` is the main entry point. Build it with `TunnetNode::builder()`, then call `.start().await`.

## Builder

```rust
let node = TunnetNode::builder()
    .hostname("my-service")
    .state_dir("/var/lib/my-app/tunnet")
    .api_key("tnnt_key_...")
    .organization_id("org_...")
    .network_id("uuid-of-network")
    .control_url("https://cp.tunnet.io")
    .management_url("https://api.tunnet.io")
    .standalone(true)
    .poll_secs(30)
    .start()
    .await?;
```

| Option | Purpose |
|--------|---------|
| `hostname` | Name advertised on the mesh |
| `state_dir` | Where identity and state are stored (also `TUNNET_STATE_DIR`) |
| `api_key` / `organization_id` / `network_id` | Auto-enroll when no identity exists yet |
| `control_url` | Control plane URL (also `CONTROL_PLANE_URL`) |
| `management_url` | Management API URL for API-key enroll (also `MANAGEMENT_URL`) |
| `standalone` | Skip multi-process sharing; always run a private node (useful in tests) |
| `poll_secs` | How often to refresh membership from the control plane |

If a persisted identity already exists under `state_dir`, the builder reuses it and skips enrollment.

## Standalone enrollment

You can enroll once without starting a full node:

```rust
use tunnet::{enroll, EnrollConfig};

let result = enroll(EnrollConfig {
    control_url: Some("https://cp.tunnet.io".into()),
    management_url: Some("https://api.tunnet.io".into()),
    api_key: Some("tnnt_key_...".into()),
    organization_id: Some("org_...".into()),
    network_id: Some("uuid-of-network".into()),
    hostname: Some("my-service".into()),
    state_dir: Some("/var/lib/my-app/tunnet".into()),
    ..Default::default()
})
.await?;

println!("{} → {}", result.endpoint_id, result.ip);
```

Token enrollment is also supported via `token` + `control_url` instead of API key fields.

## Identity and peers

```rust
let endpoint_id = node.endpoint_id(); // hex endpoint id
let ip = node.self_ip();              // overlay IPv4 (if this process owns the node)

let peers = node.list_peers().await?;
for peer in peers {
    println!("{}  {}  {}", peer.ip, peer.hostname, peer.endpoint_id);
}
```

`is_coordinator()` is `true` when this process owns the mesh endpoint. If another process on the same machine already holds the shared state, this process becomes a client and proxies stream/peer calls through it.

## Shutdown

```rust
node.shutdown().await;
```

Safe to call more than once.
