# Node SDK

TunTun provides a Node.js/Bun SDK (`@tuntun/sdk`) that lets you embed mesh networking directly in your applications. The SDK wraps the Rust core via napi-rs, giving you native performance with a TypeScript API.

## Installation

```bash
bun add @tuntun/sdk
```

## Quick start

```ts
import { TunTunNode } from "@tuntun/sdk";

const node = await TunTunNode.create({
  controlUrl: "http://control:8080",
  stateDir: "/tmp/tuntun-sdk",
});

// List peers on the mesh
const peers = await node.listPeers();
console.log("Peers:", peers);

// Open a stream to a peer
const stream = await node.openStream("api-server", 8080);
await stream.write(new TextEncoder().encode("GET / HTTP/1.1\r\nHost: api-server\r\n\r\n"));
const response = await stream.read();
console.log(new TextDecoder().decode(response));
await stream.end();

// Send a file
await node.sendFile("./data.csv", "db-server", "daily export");

await node.close();
```
