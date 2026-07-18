# Why Tunnet?

Most teams eventually need private networking. Developers want to reach a machine at home from a laptop in a café. A small company wants its servers to behave like they share a LAN even when they are on different continents. Someone needs to open an admin panel that was never meant to face the public internet.

Commercial options exist and they are good at what they do. Tunnet exists because the category needs an alternative that is fully open.

## The control plane problem

The most important difference between Tunnet and its competitors is not a feature. It is a philosophy. In Tailscale, the coordination server - the thing that decides who can talk to whom and manages keys - is proprietary. Headscale exists as a community replacement, but it is a third-party reimplementation with inherent compatibility lag.

In Tunnet, the control plane is part of the main repository. The management API, the dashboard, the enrollment flow, the policy engine - it is all there. You do not need to trust a hosted service, and you do not need to rely on a reimplementation that might fall behind.

## One stack, many products

Other tools force you to stitch together multiple vendors for a complete solution. You might use Tailscale for mesh VPN, ngrok for public tunnels, scp for file transfer, and a separate SSH bastion. Tunnet integrates all of these under one identity system, one access policy engine, and one CLI.

This is not about replacing each tool with a worse version. It is about the compounding value of having a single identity that flows through mesh connectivity, service exposure, tunnel creation, file transfer, SSH sessions, and device posture checks.

## Two modes for two worlds

Not every use case needs an organization, a dashboard, or SSO. Sometimes you just want two machines to talk to each other. Tunnet's Direct mode creates a P2P network with no server whatsoever - membership is stored in an iroh-docs CRDT document, discovery uses the Mainline DHT, and transport auth proves knowledge of a pre-shared key.

When you outgrow Direct mode, `tunnet upgrade-to-managed` migrates your network to the full control plane without losing connectivity.

## Technology choices

Tunnet uses QUIC (via iroh) instead of WireGuard. This is a deliberate choice. WireGuard is excellent at what it does, but building on top of it means working around its limitations: no built-in NAT traversal, no relay protocol, no multiplexed streams. iroh provides all of this natively, and Tunnet gets QUIC encryption, connection migration, and datagram support for free.

The control plane is written in Rust (for the core and agent) and TypeScript/Bun (for the management API and dashboard). PostgreSQL stores organization state. The agent creates a TUN interface and handles routing, DNS, and policy enforcement locally.
