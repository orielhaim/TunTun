# Networks & Peers

A TunTun network is a group of machines that can reach each other over an encrypted overlay. Each network has its own IP address space, routing table, DNS suffix, and access policies.

## Organizations and networks

In managed mode, an **organization** is the top-level entity. Users authenticate against the organization, and each organization can contain multiple networks. A network is where machines actually live and communicate.

When you create an organization, a "default" network is created automatically with a 10.7.0.0/16 CIDR. You can create additional networks for segmentation - for example, separating production from staging.

## Peers

Every machine in a network is a peer. Each peer has an endpoint ID (a 64-character hex string derived from its Ed25519 public key), an assigned mesh IPv4 address, a hostname, and optionally tags.

Peers communicate over encrypted QUIC connections via iroh. When a direct path exists (both peers can reach each other's public IP or through NAT traversal), traffic flows peer-to-peer. When direct connectivity fails, traffic relays through the iroh relay network.

## Tags

Tags are labels you assign to machines. They serve as the primary mechanism for access control. A policy might say "machines tagged `backend` can reach machines tagged `database` on port 5432." Tags are managed through the dashboard or API.

## Peer discovery

In managed mode, the control plane distributes the peer list as part of the network snapshot. Each peer gets the iroh endpoint IDs of all other peers it is allowed to communicate with.

In direct mode, peers discover each other through the Mainline DHT using a topic derived from the network name and secret. iroh-docs replicates the membership document to all peers.
