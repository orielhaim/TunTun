# Path-Based Redirects

Tunnels support path-based redirects, allowing you to route different URL paths to different local ports or mesh IPs.

## Use case

You have a frontend on port 3000 and an API on port 8080. With path-based redirects, requests to `https://your-tunnel.example.com/api/*` go to port 8080, while everything else goes to port 3000.

## Configuration

Path-based redirects are configured on the tunnel detail page in the dashboard. Each redirect rule specifies a path pattern (exact match or wildcard with `*`) and a target port. Optionally, you can specify a target mesh IPv4 to forward to a different machine on the mesh instead of localhost.

Rules are evaluated in order - the first matching rule wins.
