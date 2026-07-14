# Exit Nodes

An exit node routes your internet-bound traffic through a specific machine on the mesh. All traffic that is not destined for the mesh itself flows through the exit node.

## Use cases

You need a fixed egress IP for a service that whitelists by IP address. You want to route traffic through a specific geographic location. You want all internet traffic from remote workers to pass through a corporate gateway for logging.

## Configuration

Exit nodes are configured per-device through the dashboard or the device profile in the network snapshot. The device profile specifies which endpoint to use as the exit node.

## Split tunnels

Split tunnel settings control which traffic uses the exit node. In **exclude** mode (default), you specify CIDRs that should bypass the exit node and go directly to the local network. In **include** mode, only specified CIDRs use the exit node.
