# Gossip & Presence

TunTun uses a gossip protocol (iroh-gossip) alongside the control plane for real-time peer presence. Each network has a gossip topic derived from its ID. Peers join the topic and broadcast their status.

## Why gossip alongside the control plane?

The control plane provides authoritative configuration (peer lists, policies, routes), but it operates on a polling interval (default 30 seconds). Gossip provides sub-second presence updates - you know immediately when a peer comes online or goes offline.

The dashboard also connects to a presence SSE stream to show live machine status.

## Bootstrap

When an agent starts, the network snapshot includes a `gossip_bootstrap` list of peer endpoint IDs. The agent uses these to join the gossip topic and begin receiving presence updates.
