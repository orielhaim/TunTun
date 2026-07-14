# TunTunNode

`TunTunNode` is the main SDK class. It represents a handle to the overlay network from a single process.

## Creation

```ts
const node = await TunTunNode.create({
  stateDir: "/path/to/state",       // Where to persist identity
  hostname: "my-app",               // Hostname on the mesh
  controlUrl: "http://control:8080", // Control plane URL
  managementUrl: "http://mgmt:3000", // Management API (for API key enroll)
  apiKey: "key_...",                 // API key for enrollment
  organizationId: "org_...",         // Target organization
  networkId: "net_...",              // Target network
  pollSecs: 30,                      // Snapshot poll interval
  standalone: false,                 // Skip coordinator sharing
});
```

## Properties

`node.endpointId` returns the 64-character hex endpoint ID.

`node.isCoordinator` returns whether this process is the iroh coordinator (vs. a client of another process sharing the same state directory).

## Methods

`node.listPeers()` returns all peers on the mesh with their IPs, hostnames, and endpoint IDs.

`node.openStream(host, port)` opens a duplex byte stream to a peer. `host` can be a mesh IP, hostname, or endpoint ID.

`node.fetch(url, init?)` is a convenience method for HTTP requests over the mesh.

`node.sendFile(path, target, message?)` sends a file or directory to a peer.

`node.acceptTransfer(id)` accepts a pending file offer.

`node.rejectTransfer(id, reason?)` rejects a pending file offer.

`node.listPendingTransfers()` returns pending inbound offers.

`node.listTransfers()` returns all active and pending transfers.

`node.onFileOffer(callback, intervalMs?)` polls for new file offers and calls the callback. Returns an unsubscribe function.

`node.close()` shuts down the node.
