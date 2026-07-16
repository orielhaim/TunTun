# Send

`tunnet send` transfers files and directories between machines over the mesh. Transfers are peer-to-peer (no intermediate storage), verified with BLAKE3 hashing via iroh-blobs, and protected by a consent system.

## Quick start

```bash
# Send a file to a peer
tunnet send ./report.pdf db-server

# Send a directory with a message
tunnet send ./photos laptop --message "from the shoot"

# Multicast to all machines with a tag
tunnet send ./build.tar.gz tag:ci

# View pending offers
tunnet send list

# Accept or reject
tunnet send accept <transfer_id>
tunnet send reject <transfer_id>

# View history
tunnet send history

# Configure consent mode and inbox
tunnet send config
tunnet send config --consent prompt --inbox ~/Tunnet/inbox
```

## How it works

The sender offers a file (or directory) to the target peer(s). If the receiver's consent mode allows it, the transfer proceeds immediately. Otherwise, the offer appears as a pending transfer that the receiver must explicitly accept or reject.

Files land in `~/Tunnet/inbox/` by default. Each file is transferred as an iroh-blob, so data integrity is cryptographically verified end-to-end with BLAKE3.

## Node SDK

File transfer is also available from the Node SDK:

```ts
const node = await TunnetNode.create();
await node.sendFile("./data.csv", "api-server", "weekly export");
```
