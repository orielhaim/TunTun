# Environment Variables

Complete reference for all environment variables used by TunTun components.

## Control plane (`tuntun-control`)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@localhost:5432/tuntun` |
| `TUNTUN_SERVICE_SECRET` | Internal API shared secret | `a-long-random-string-at-least-32-characters` |

## Management server

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@localhost:5432/tuntun` |
| `BETTER_AUTH_SECRET` | Auth signing secret (32+ chars) | `a-long-random-string-at-least-32-characters` |
| `BETTER_AUTH_URL` | Public URL of management server | `http://localhost:3000` |
| `MANAGEMENT_PORT` | Listen port | `3000` |
| `MANAGEMENT_WEB_ORIGIN` | Dashboard origin (CORS) | `http://localhost:5173` |
| `CONTROL_PLANE_ADMIN_URL` | Control plane admin API | `http://127.0.0.1:9091` |
| `TUNTUN_SERVICE_SECRET` | Internal API shared secret | `a-long-random-string-at-least-32-characters` |

## Dashboard

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_MANAGEMENT_API_URL` | Management API URL | `http://localhost:3000` |

## Agent (`tuntun`)

| Variable | Description | Example |
|----------|-------------|---------|
| `TUNTUN_STATE_DIR` | Agent state directory | `~/.local/state/tuntun` |
| `TUNTUN_CONTROL_URL` | Control plane URL | `http://127.0.0.1:8080` |
| `TUNTUN_MANAGEMENT_URL` | Management API URL | `http://localhost:3000` |
| `TUNTUN_ENROLL_TOKEN` | Enrollment token | `eyJ...` |
| `TUNTUN_ORG_SLUG` | Organization slug (quick enroll) | `my-company` |
| `TUNTUN_HOSTNAME` | Machine hostname | `api-prod` |
| `TUNTUN_IFNAME` | TUN interface name | `tuntun0` |
| `TUNTUN_POLL_SECS` | Snapshot poll interval | `30` |
| `TUNTUN_METRICS_BIND` | Prometheus metrics bind | `127.0.0.1:9100` |
| `TUNTUN_DISABLE_GOSSIP` | Disable gossip | `true` |
| `TUNTUN_RECORDER` | Enable SSH recording | `true` |
| `TUNTUN_JSON_LOGS` | JSON log format | `true` |
