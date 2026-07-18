# File Transfer (Rust)

Enable the `send` feature:

```toml
tunnet = { version = "0.2", features = ["managed", "send"] }
```

## Sending files

```rust
let transfers = node
    .send_file("./report.pdf", "db-server", Some("monthly report".into()))
    .await?;

for t in transfers {
    println!("{} → {} ({})", t.file_name, t.peer_endpoint_id, t.status);
}
```

The target can be a mesh IP, hostname, endpoint id, or `tag:name` to send to peers with that tag.

## Receiving files

```rust
// List offers waiting for consent
let pending = node.list_pending_transfers()?;
for offer in pending {
    println!(
        "{} from {:?} ({} bytes)",
        offer.file_name, offer.peer_hostname, offer.size
    );
    node.accept_transfer(&offer.transfer_id).await?;
    // or: node.reject_transfer(&offer.transfer_id, Some("not needed".into())).await?;
}

// All active + pending transfers
let all = node.list_transfers()?;
```

## Transfer fields

Each `Transfer` includes `transfer_id`, `direction` (`"outbound"` / `"inbound"`), `file_name`, `size`, `status`, `percent`, `bytes_transferred`, optional `message` / `error`, and `inbox_path` for completed inbound files.

File transfer APIs require the coordinator process (or `standalone(true)`).
