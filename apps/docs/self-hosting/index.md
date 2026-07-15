# Self-Hosting

TunTun is designed to be fully self-hosted. Unlike competitors where the control plane is proprietary, TunTun gives you the entire stack.

## Components to deploy

**PostgreSQL** - the shared database for all state.

**tuntun-control** (Rust) - the control plane that agents connect to on port 8080. Also runs an internal admin API on port 9091.

**Management API** (Bun/Elysia) - the HTTP API and auth server on port 3000.

**Dashboard** (Tanstack Start) - the web UI on port 5173 (or built and served statically in production).

**tuntun-relay** (Rust, optional) - the public tunnel edge server.

## Quick deployment

```bash
# 1. Build Rust binaries
cargo build --release

# 2. Install JS dependencies and migrate database
bun install
bun run db:migrate

# 3. Start services
./target/release/tuntun-control &
bun run management:start &
bun run dash:build &
bun run dash:preview &
```

See the following pages for detailed configuration of each component.
