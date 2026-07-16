# Mesh Network

The mesh network is Tunnet's core product. It creates an encrypted overlay network where every machine gets an internal IP address and can reach every other machine - SSH, ping, curl, HTTP, anything that uses TCP or UDP.

## How it competes

The mesh network competes directly with **Tailscale** (mesh VPN), **Cloudflare WARP connector** (site-to-site connectivity), and raw **WireGuard** (encrypted tunneling). The key differentiator is that Tunnet's control plane is fully open source, and the transport uses QUIC/iroh instead of WireGuard.

## Key features

**Automatic IP allocation** - machines get mesh IPs from the network CIDR (default 10.7.0.0/16) during enrollment. No manual configuration needed.

**Peer-to-peer QUIC** - traffic flows directly between peers when possible. NAT traversal is handled by iroh. When direct paths fail, iroh relays carry the connection transparently.

**Subnet routes** - advertise LAN subnets through a gateway so devices without the agent are reachable from the mesh.

**Hostname routes** - map DNS names to mesh IPs for internal service discovery.

**PeerDNS** - resolve peer hostnames and route hostnames on the mesh. No more memorizing IP addresses.

**Exit nodes** - route internet traffic through a chosen mesh peer for fixed egress.

**High availability gateways** - group gateways so routes survive individual machine failures.

**Gossip presence** - real-time peer status via gossip protocol alongside the control plane polling.

## Quick start

```bash
# Enroll and start
sudo tunnet enroll --control-url http://control:8080 --token TOKEN
sudo tunnet run

# Inspect the network
tunnet status --peers
tunnet ping other-machine
tunnet dns status
tunnet route list

# Diagnostics
tunnet diag
tunnet netcheck
```
