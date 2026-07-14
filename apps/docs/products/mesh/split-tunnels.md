# Split Tunnels

Split tunnels control which traffic flows through the mesh (and optionally through an exit node) versus going directly through the local network.

## Modes

**Exclude mode** (default): all traffic goes through the mesh/exit node except for the specified CIDRs. Use this when you want most traffic to flow through the mesh but need to exclude certain local services.

**Include mode**: only traffic for the specified CIDRs goes through the mesh/exit node. Everything else uses the local network. Use this when you want minimal mesh involvement.

## Configuration

Split tunnel preferences are part of the device profile, configured per-machine through the dashboard or API under the machine's detail page.
