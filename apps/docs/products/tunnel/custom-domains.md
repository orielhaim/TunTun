# Custom Domains

By default, tunnels get a subdomain on the relay's domain (e.g., `abc123.relay.example.com`). You can configure custom domains by pointing your DNS at the relay and configuring the tunnel in the dashboard.

The relay supports ACME (Let's Encrypt) for automatic TLS certificate provisioning on non-wildcard domains. For wildcard domains, bring your own certificates.

See the [Relay documentation](/products/relay/) for details on DNS and certificate configuration.
