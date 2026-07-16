# Node SDK

Tunnet provides a Node.js/Bun SDK (`@tunnet/sdk`) that lets you embed mesh networking directly in your applications. The SDK wraps the Rust core via napi-rs, giving you native performance with a TypeScript API.

## Installation

```bash
bun add @tunnet/sdk
```

## Quick start

```ts
import { TunnetNode } from "@tunnet/sdk";

const node = await TunnetNode.create({
  controlUrl: "http://control:8080",
  stateDir: "/tmp/tunnet-sdk",
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
