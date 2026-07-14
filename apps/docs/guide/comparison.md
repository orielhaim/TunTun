# Comparison with Alternatives

TunTun is built to compete with several established products across different use cases. Here is an honest comparison.

## vs Tailscale

Tailscale is the primary competitor. Both products create an encrypted mesh overlay network where machines get internal IPs and can reach each other directly.

TunTun's differentiator is that the **entire stack is open source** - including the control plane, management API, and dashboard. Tailscale's coordination server is proprietary. Headscale exists as a community alternative, but it is a reimplementation that lags behind.

TunTun uses QUIC via iroh instead of WireGuard. This gives native multiplexed streams, built-in NAT traversal, and relay fallback without userspace WireGuard workarounds.

Tailscale is ahead in maturity, platform coverage, enterprise features, and battle-tested reliability. TunTun is honest about this gap.

## vs ngrok

ngrok provides public tunnels to local services. TunTun's `tuntun tunnel` does the same thing - give a local port a public HTTPS URL through a relay.

TunTun's advantage is that tunnels are part of a broader mesh network. You get public endpoints AND private mesh connectivity AND file transfer AND SSH - all under one identity system. Plus, you can self-host the relay infrastructure.

## vs Cloudflare Tunnel / Access / WARP

Cloudflare offers multiple overlapping products. Cloudflare Tunnel exposes internal services. WARP provides device connectivity. Access provides zero-trust authentication.

TunTun's `tuntun tunnel` competes with Cloudflare Tunnel. `tuntun mesh` + `tuntun route` competes with WARP connector. `tuntun serve` with ACLs competes with Cloudflare Access. The difference is that TunTun is self-hosted and open source - no vendor dependency on Cloudflare's edge network.

## vs WireGuard (raw)

Raw WireGuard requires manual key exchange, manual IP allocation, and manual configuration. TunTun automates all of this with enrollment, a control plane, and automatic peer discovery. TunTun also adds features WireGuard does not have: DNS, service exposure, public tunnels, file transfer, and SSH.

## Feature matrix

| Feature | TunTun | Tailscale | ngrok | Cloudflare |
|---------|--------|-----------|-------|------------|
| Mesh VPN | Yes | Yes | No | Partial (WARP) |
| Open control plane | Yes | No | No | No |
| Public tunnels | Yes | Funnel (limited) | Yes | Yes |
| Internal services | Serve | Serve (Funnel) | No | Access |
| File transfer | Send | Taildrop | No | No |
| SSH (identity-based) | Yes | Yes | No | No |
| Self-hosted relay | Yes | DERP (partial) | No | No |
| SSO / OIDC | Yes | Yes | Yes | Yes |
| ACL policies | Yes | Yes | No | Yes |
| Session recording | Yes | Yes | No | No |
| P2P mode (no server) | Direct mode | No | No | No |
| License | AGPL-3.0 | Proprietary | Proprietary | Proprietary |
