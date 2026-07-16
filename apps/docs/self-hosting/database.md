# Database

Tunnet uses PostgreSQL as its primary data store. All state - organizations, networks, endpoints, tunnels, serves, routes, policies, SSH sessions, auth tables - lives in PostgreSQL.

## Setup

```bash
# Create the database
createdb tunnet

# Run migrations
bun install
bun run db:migrate
```

## Schema management

The schema is managed with Drizzle ORM. The schema definitions live in `packages/db/src/schema/`. Migrations are in `packages/db/drizzle/`.

## Utilities

```bash
# Generate migrations after schema changes
bun run db:generate

# Open Drizzle Studio for database browsing
bun run db:studio
```

If Better Auth migrations create tables that need specific grants, use the helper scripts in `packages/db/scripts/`.
