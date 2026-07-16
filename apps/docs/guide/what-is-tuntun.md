# What is Tunnet?

Tunnet connects your machines into a private network - the kind you would normally build inside an office or a data center. Install an agent on each device, and it gets an internal IP address. After that, ordinary tools just work: SSH, ping, curl, a browser pointed at an internal service. You do not need to teach every application about tunnels or VPNs. The network is the network.

Tunnet operates in two modes that serve fundamentally different audiences. **Managed mode** is built for organizations that need SSO, access policies, a web dashboard, audit logs, and a central control plane. **Direct mode** is a zero-infrastructure P2P mesh where peers discover each other via DHT and coordinate through iroh-docs - no server needed at all.

## The products inside Tunnet

Tunnet is not a single tool. It is a collection of networking primitives that compose into different solutions depending on what you need.

**Mesh** is the core: an encrypted overlay network using QUIC datagrams (powered by [iroh](https://iroh.computer)). Machines get mesh IPs, can ping each other, advertise subnet routes, and resolve hostnames through PeerDNS. This competes directly with Tailscale's mesh VPN and Cloudflare's WARP connector.

**Serve** exposes a local port to other machines on the mesh with an internal hostname and TLS from your organization's internal CA. Think of it as an internal service mesh - like what Cloudflare Access provides, but running on your own infrastructure.

**Tunnel** gives a local port a public HTTPS URL through a relay. This is the ngrok competitor: instant public endpoints for webhooks, demos, or permanent services without opening firewall holes.

**Send** is peer-to-peer file transfer over the mesh, verified with BLAKE3 via iroh-blobs. No intermediate storage, no cloud upload - direct machine-to-machine transfer with consent controls.

**SSH** provides identity-based SSH over the mesh. No SSH keys to distribute. Auth is tied to Tunnet identity and organization policies. Sessions can be recorded and replayed from the dashboard.

**Relay** is a self-hosted edge server that terminates public tunnels. You point DNS at it, optionally configure Let's Encrypt, and it becomes your tunnel infrastructure. This competes with Cloudflare Tunnel's edge network, except you own the servers.

## What makes Tunnet different

Everything is open source - not just the agent on your laptop. The control plane, the coordination layer, the management API, the dashboard. You can read every line, self-host the entire stack, and know exactly what your network is doing.

Tunnet is built on iroh and QUIC datagrams instead of WireGuard. NAT traversal, encryption, and relay fallback are handled in the protocol stack. When a direct path exists, traffic flows peer-to-peer. When it doesn't, relays carry the connection transparently.

## Who this is for

Tunnet is for people who want a private internal network without handing the keys to a closed platform. Self-hosters, small teams, DevOps engineers, anyone who has looked at mesh VPN products and thought: *I would use this, but I want to see the control server too.*

It is early. Some things are still rough. If you need something battle-tested today for a large organization with strict compliance requirements, Tailscale is probably the safer bet. Tunnet is honest about that. The gap is narrowing.
