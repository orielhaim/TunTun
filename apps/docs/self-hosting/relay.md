# Self-Hosting a Relay

The relay (`tunnet-relay`) is an optional component for organizations that need public tunnels (`tunnet tunnel`). It is a standalone Rust binary that terminates public HTTPS/TCP connections and forwards them to agents through reverse tunnels.

## Running with Docker

The relay is **not** included in the default `docker-compose.yml` because it requires public DNS pointing to your server and TLS certificates. To add it:

```yaml
# Add to docker-compose.yml services:
relay:
  build:
    context: .
    dockerfile: deploy/Dockerfile.relay
  restart: unless-stopped
  depends_on:
    control:
      condition: service_started
  ports:
    - "443:443"
    - "80:80"
  environment:
    TUNNET_RELAY_CONTROL_URL: "http://control:8080"
  volumes:
    - relay-certs:/etc/tunnet/certs

# Add to volumes:
volumes:
  pgdata:
  relay-certs:
```

The relay image is built from `deploy/Dockerfile.relay` - a simple multi-stage Rust build into `debian:bookworm-slim`. It exposes ports 80 and 443.

## Running manually

```bash
# Register the relay with the control plane
tunnet-relay register \
  --control-url http://control:8080 \
  --token YOUR_RELAY_TOKEN

# Run the relay
tunnet-relay run
```

## DNS setup

Point your tunnel wildcard domain at the relay server's public IP:

```
*.tunnel.example.com  →  A  →  <relay-public-ip>
```

## TLS certificates

The relay needs TLS certificates to terminate public HTTPS. You have three options:

**ACME (Let's Encrypt)** - the relay can automatically obtain and renew certificates. Configure the ACME settings in the relay startup options.

**Bring your own certs** - pass certificates directly:

```bash
tunnet-relay run \
  --cert-file /path/to/fullchain.pem \
  --key-file /path/to/privkey.pem
```

**Reverse proxy** - put the relay behind a reverse proxy (Caddy, nginx, Traefik) that handles TLS termination, and run the relay in HTTP mode.

See `tunnet-relay --help` for all available options.
