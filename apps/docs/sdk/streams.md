# Streams & Fetch

## TunTunStream

`TunTunStream` is a duplex byte stream over the overlay network. It wraps an iroh QUIC stream.

```ts
const stream = await node.openStream("api-server", 8080);

// Read
const data = await stream.read(65536); // Buffer, empty = EOF

// Write
await stream.write(new TextEncoder().encode("hello"));

// Close send side
await stream.end();
```

## Web Streams integration

`TunTunStream` can be converted to Web API `ReadableStream` and `WritableStream`:

```ts
const readable = stream.toReadableStream();
const writable = stream.toWritableStream();
```

## Fetch

`node.fetch()` provides a convenience HTTP/1.1 client over the mesh:

```ts
const response = await node.fetch("http://api-server:3000/health", {
  method: "GET",
  headers: { "Authorization": "Bearer token" },
});

console.log(response.status);
console.log(new TextDecoder().decode(response.body));
```

For complex HTTP semantics, use `openStream()` directly and wire it into your preferred HTTP client.
