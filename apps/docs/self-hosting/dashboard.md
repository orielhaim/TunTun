# Dashboard

The dashboard (`apps/dashboard`) is a React SPA built with Vite, TanStack Query, and shadcn/ui.

## Running with Docker

```bash
docker compose up -d dashboard
```

The dashboard image is built from `deploy/Dockerfile.dashboard`. At build time, Vite compiles the React app. The `VITE_MANAGEMENT_API_URL` build arg can be left empty - the dashboard then uses the same origin and the Nitro server proxies `/api` to the management service.

At runtime, `MANAGEMENT_API_URL` tells the Nitro proxy where to reach the management server (default: `http://management:3000` in Docker).

## Running manually

```bash
bun run dev:dash
```

## Configuration

| Variable | Context | Description |
|----------|---------|-------------|
| `VITE_MANAGEMENT_API_URL` | Build arg | Management API URL baked into the frontend. Leave empty for same-origin proxy. |
| `MANAGEMENT_API_URL` | Runtime env | Where the Nitro server proxies API requests (default: `http://management:3000`) |

## Pages

The dashboard covers **Overview** (organization summary), **Machines** (list, detail, tags, serves, tunnels), **Relays** (registration, status), **Tunnels** (create, manage, redirects, port mappings), **Serves** (create, manage, ACLs), **Transfers** (file transfer monitoring), **SSH** (sessions, recordings), **Networks** (mesh map, access policies, routes, enrollment), **Users** (organization members), **Access** (org-wide policies), **Logs** (audit trail), and **Settings** (organization, internal CA, tunnel defaults, SSO, API keys, account).
