# Serve

`tunnet serve` exposes a local port to other machines on your Tunnet mesh. The service gets an internal hostname and TLS from your organization's internal CA. Peers can reach it like a LAN service. ACLs can restrict access by tags or specific machines.

## How it competes

Serve competes with **Cloudflare Access** (zero-trust internal services), **Tailscale Serve** (exposing services on the tailnet), and traditional internal load balancers. The difference is that Tunnet Serve runs entirely on your infrastructure with an open-source control plane.

## Quick start

```bash
# Expose port 3000 to the mesh
tunnet serve 3000

# Check what's being served
tunnet serve status

# Stop serving
tunnet serve off 3000
```

Other machines on the mesh can now reach your service at `your-hostname.tunnet:3000` with TLS.

## Dashboard management

Serves can also be created and managed from the dashboard under **Serves** or from a machine's detail page. The dashboard lets you configure the internal hostname, protocol, and ACL rules.

## How it works

When you run `tunnet serve 3000`, the agent registers the serve with the control plane. The control plane distributes the serve information to all peers in the network snapshot. Other peers' agents add the serve to their routing tables. When a peer connects to the internal hostname, their agent opens a QUIC stream to your agent, which proxies the connection to your local port 3000.

The internal TLS certificate is signed by your organization's internal CA (generated automatically and stored in the control plane). Peers trust the CA root certificate distributed in the network snapshot.
