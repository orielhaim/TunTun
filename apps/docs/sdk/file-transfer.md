# File Transfer (SDK)

The SDK exposes the same file transfer capabilities as `tuntun send`.

## Sending files

```ts
const transfers = await node.sendFile("./report.pdf", "db-server", "monthly report");
console.log("Started transfers:", transfers);
```

## Receiving files

```ts
// Poll for incoming offers
const unsub = node.onFileOffer((offer) => {
  console.log(`Incoming: ${offer.fileName} from ${offer.peerHostname}`);
  node.acceptTransfer(offer.transferId);
});

// Or manually check
const pending = await node.listPendingTransfers();
for (const p of pending) {
  await node.acceptTransfer(p.transferId);
}

// Clean up
unsub();
```

## Transfer info

Each transfer has a `transferId`, `direction` (send/receive), `fileName`, `size`, `status`, `percent` progress, and optional `message`.
