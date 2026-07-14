# Control Plane

The control plane (`tuntun-control`) is the Rust server that coordinates managed networks.

## What it does

The control plane handles machine enrollment and IP allocation, network snapshot building and distribution, peer discovery (exchanging iroh endpoint IDs), WebSocket connections from agents, policy distribution, tunnel routing (assigning tunnels to relays), relay registration, SSH session tracking, audit logging, and the internal admin API (port 9091) used by the management server.

## Ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 8080 | WebSocket | Agent connections |
| 9090 | HTTP | Internal metrics |
| 9091 | HTTP | Admin API (used by management server) |

## Running with Docker

```bash
docker compose up -d control
```

The control plane image is built from `deploy/Dockerfile.control` using a multi-stage Rust build with cargo-chef for layer caching. The final image is based on `debian:bookworm-slim` and contains only the binary plus `ca-certificates`.

## Running manually

```bash
./target/release/tuntun-control
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | - | PostgreSQL connection string (required) |
| `TUNTUN_BIND` | `0.0.0.0:8080` | Agent WebSocket bind address |
| `TUNTUN_INTERNAL_BIND` | `0.0.0.0:9090` | Internal metrics bind |
| `TUNTUN_ADMIN_BIND` | `0.0.0.0:9091` | Admin API bind |
| `TUNTUN_SERVICE_SECRET` | - | Shared secret for internal API auth (required, must match management) |
| `TUNTUN_JSON_LOGS` | `false` | Enable structured JSON logs |
