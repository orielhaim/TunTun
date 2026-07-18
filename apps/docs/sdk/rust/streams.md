# Streams (Rust)

## Outbound streams

`open_stream` opens a duplex byte stream to a peer. The host can be a mesh IP, hostname, or endpoint id.

`TunnetStream` implements Tokio's `AsyncRead` and `AsyncWrite`, so it works with `BufReader`, `copy_bidirectional`, and the rest of the Tokio I/O ecosystem.

```rust
use tokio::io::{AsyncReadExt, AsyncWriteExt};

let mut stream = node.open_stream("api-server", 8080).await?;
stream.write_all(b"GET /health HTTP/1.1\r\nHost: api-server\r\n\r\n").await?;

let mut buf = vec![0u8; 4096];
let n = stream.read(&mut buf).await?;
println!("{}", String::from_utf8_lossy(&buf[..n]));

// Finish the send side
tokio::io::AsyncWriteExt::shutdown(&mut stream).await?;
```

## Inbound streams

Take a `StreamListener` once, then accept connections in a loop - similar to `TcpListener`:

```rust
use tokio::io::{AsyncReadExt, AsyncWriteExt};

let mut listener = node.stream_listener().await?;

loop {
    let (mut stream, peer, header) = listener.accept().await?;
    println!(
        "from {} → {}:{}",
        peer.hostname, header.host, header.dst_port
    );

    tokio::spawn(async move {
        let mut buf = [0u8; 4096];
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
```

`stream_listener()` is only available when this process is the coordinator (or `standalone(true)`). Client-mode processes get an error - run the listener in the primary process.

## Stream header

Each inbound accept returns a `StreamHeader` with:

- `dst_port` - port the dialer requested
- `host` - host string the dialer sent (IP, hostname, or endpoint id)
