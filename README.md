# TunTun

[![Status](https://img.shields.io/badge/status-in%20development-orange?style=flat-square)](https://github.com/orielhaim/TunTun)
[![Discord](https://img.shields.io/badge/discord-join%20server-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.gg/y5bNc3MYKz)

TunTun connects your machines into a private network - the kind you would normally build inside an office or a data center. Install an agent on each device, and it gets an internal IP address. After that, ordinary tools just work: SSH, ping, curl, a browser pointed at an internal service. You do not need to teach every application about tunnels or VPNs. The network is the network.

## Why this exists

Most teams eventually need something like this. Developers want to reach a machine at home from a laptop in a café. A small company wants its servers to behave like they share a LAN even when they do not. Someone needs to open an admin panel that was never meant to face the public internet.

Commercial options exist. Tailscale is the obvious one, and they are very good at what they do. TunTun is meant to be a direct competitor to that model - same general problem, same general shape, a private overlay network you can actually use.

We should be honest about where we stand: they are ahead of us by roughly ten percent, and the gap is not closing as fast as our pride would prefer. We are building anyway, because we think the category needs an alternative that is fully open.

## Features

### Mesh networking

Machines join with an agent, get an address on the network, and reach each other over encrypted peer-to-peer QUIC (iroh). Access policies decide who can talk to whom. Use `tuntun status`, `tuntun ping`, `tuntun diag`, and `tuntun netcheck` to inspect the mesh.

### Routes without agents

Advertise a LAN subnet or a hostname through a gateway machine. Printers, NAS boxes, and internal services become reachable from the mesh without installing anything on them. Manage routes in the dashboard (**Networks → Routes**) or with `tuntun route list` / `tuntun route add`.

### PeerDNS

Resolves machine names and hostname routes on the network so you can use familiar hostnames instead of memorizing IPs. Check status with `tuntun dns status`. Configure the Peer DNS suffix in **Settings → Organization**.

### Serve - share a port with the mesh

Expose a local service to other machines on your network with an internal hostname and TLS from your org’s internal CA. Peers reach it like a LAN service; ACLs can limit access to tags or specific machines.

```bash
tuntun serve 3000
tuntun serve status
tuntun serve off 3000
```

Also available from the dashboard (**Serves**, or a machine’s detail page).

### Tunnel - share a port with the internet

Give a local port a public HTTPS URL through a relay. Useful for demos, webhooks, and anything that needs to be reachable from outside without opening inbound firewall holes on the machine itself.

```bash
tuntun tunnel 3000
tuntun tunnel status
tuntun tunnel off 3000
```

Tunnels support **path-based redirects** and **TCP port mappings** on the tunnel detail page in the dashboard.

### Send - transfer files over the mesh

Copy files and directories between machines peer-to-peer over the mesh (BLAKE3-verified via iroh-blobs). No public upload, no shared drive - the sender offers, the receiver consents (or auto-accepts), and the payload lands in `~/TunTun/inbox/` by default.

```bash
# Send a file or directory to a peer (hostname, mesh IP, or endpoint id)
tuntun send ./report.pdf db-server
tuntun send ./photos laptop --message "from the shoot"

# Multicast to every machine with a tag
tuntun send ./build.tar.gz tag:ci

# Pending offers (when consent mode is prompt)
tuntun send list
tuntun send accept <transfer_id>
tuntun send reject <transfer_id>

tuntun send history
tuntun send config
tuntun send config --consent prompt --inbox ~/TunTun/inbox
```

Consent modes: `prompt` (default; shared-tag peers still auto-accept), `auto_accept`, or `deny`. Watch progress, approve pending transfers, and change per-machine consent from the dashboard (**Transfers**).

Also available from the Node SDK.

### Self-hosted relays

Register your own edge relay, point DNS at it, and terminate public tunnels on infrastructure you control. Optional Let’s Encrypt for non-wildcard domains, or bring your own certificates.

```bash
tuntun-relay register --control-url http://your-control-host:8080 --token YOUR_RELAY_TOKEN
tuntun-relay run
```

### SSH over the mesh

Identity-based SSH to peers - no SSH keys to distribute. Auth is tied to TunTun identity and org/network SSH policies. Sessions and recordings show up in the dashboard (**SSH**).

```bash
tuntun ssh db-server
tuntun ssh db-server -u root
tuntun ssh db-server -- uname -a
tuntun ssh sessions
tuntun ssh recordings
tuntun ssh play <session_id>
```

Enable inbound session recording on a machine with `tuntun run --recorder` (or `TUNTUN_RECORDER=1`). Configure check-mode re-auth and recording rules under **Networks → Access → SSH Rules**.

When check-mode requires re-auth, the browser opens a TunTun SSO/session confirmation flow (`/auth/ssh`).

### SSO

Organizations can federate login to an external OIDC IdP (Okta, Google Workspace, etc.) via Better Auth’s SSO plugin. Configure the provider under **Settings → Organization**, then sign in from the dashboard login **SSO** tab with a company email or domain.

### CLI login

Link the CLI to your TunTun account with OAuth device authorization (RFC 8628) - no localhost callback gymnastics.

```bash
tuntun login --management-url http://localhost:3000
# Enter the code in Settings → Account → Authorize CLI
tuntun logout
```

Deep links from `tuntun login` open **Account** and the authorize dialog automatically.

### Access policies

Org-wide and per-network policies control who can reach what (tags, machines, CIDRs). Configure under **Access** and **Networks → Access**.

### Exit nodes & split tunnels

Send traffic for the wider internet through a chosen machine when you need a fixed egress path. Split-tunnel preferences control what stays on the mesh vs the local network.

### High availability gateways

Group gateways so that if one goes offline, another can take over and routes keep working.

### Dashboard

The web UI covers **Overview**, **Machines**, **Relays**, **Tunnels**, **Serves**, **Transfers**, **SSH**, **Networks** (mesh map, access, routes, enrollment), **Users**, **Access**, **Logs**, and **Settings** (organization, internal CA, tunnel defaults, SSO, API keys, account / CLI authorization).

## What makes TunTun different

**Everything is open source.** Not just the agent on your laptop. The control plane, the coordination layer, the management tooling - all of it. You can read it, run it yourself, fork it, and know exactly what your network is doing.

**No WireGuard workarounds.** TunTun is built on iroh and QUIC datagrams instead of riding on WireGuard or userspace WireGuard stacks. Traffic between peers is encrypted. NAT traversal is handled in the stack. When a direct path is not available, relays can carry the connection.

## Who this is for

TunTun is for people who want a private internal network without handing the keys to a closed platform. Self-hosters, small teams, anyone who has looked at mesh VPN products and thought: *I would use this, but I want to see the control server too.*

It is early. Some things are still rough. If you need something battle-tested today for a large organization with strict compliance requirements, Tailscale is probably the safer bet. We know that. We are not pretending otherwise.

## Installation

You need **Rust 1.96+**, **Bun**, and **PostgreSQL**. The agent needs permission to create a virtual network interface: root on Linux and macOS, Administrator on Windows (with the Wintun driver installed).

```bash
cargo build --release
```

Binaries:

- `target/release/tuntun-control` - control plane
- `target/release/tuntun` - agent + CLI
- `target/release/tuntun-relay` - optional public edge

### Environment

Create a `.env` at the repository root (see `.env.example`):

```
DATABASE_URL=postgres://user:pass@localhost:5432/tuntun
BETTER_AUTH_SECRET=a-long-random-string-at-least-32-characters
BETTER_AUTH_URL=http://localhost:3000
MANAGEMENT_PORT=3000
MANAGEMENT_WEB_ORIGIN=http://localhost:5173
VITE_MANAGEMENT_API_URL=http://localhost:3000
CONTROL_PLANE_ADMIN_URL=http://127.0.0.1:9091
TUNTUN_SERVICE_SECRET=a-long-random-string-at-least-32-characters
TUNTUN_MANAGEMENT_URL=http://localhost:3000
TUNTUN_CONTROL_URL=http://127.0.0.1:8080
```

### Database

```bash
bun install
bun run db:migrate
```

If Postgres grants are required for new auth tables (OAuth / SSO / device codes), use the grant helper under `packages/db/scripts/` after migrating.

### Start the stack

```bash
# Control plane (agents connect on :8080)
./target/release/tuntun-control

# Management API (:3000)
bun run dev:management

# Dashboard (:5173)
bun run dev:dash
```

Open the dashboard, create an account and organization (you get a default network). From a network’s **Enrollment** page - or **Machines → Add machine** - generate an enrollment token.

## Adding a machine

### Enroll

```bash
sudo tuntun enroll \
  --control-url http://your-control-host:8080 \
  --token YOUR_ENROLLMENT_TOKEN
```

Env alternatives: `TUNTUN_CONTROL_URL`, `TUNTUN_ENROLL_TOKEN`, `TUNTUN_HOSTNAME`. State defaults to `~/.local/state/tuntun` on Linux (`--state-dir` / `TUNTUN_STATE_DIR` to override).

Enrollment only needs to happen once per machine.

### Run

```bash
sudo tuntun run
# optional: accept SSH session recordings
sudo tuntun run --recorder
```

Creates the virtual interface (default `tuntun0`), connects to peers, and applies routing, PeerDNS, serves, tunnels, file transfers, and policies from the control plane.

Useful options: `--ifname`, `--poll-secs`, `--metrics-bind`, `--disable-gossip`, `--recorder`.

### Verify

```bash
tuntun status --peers
tuntun ping other-machine
tuntun dns status
```

From another enrolled machine:

```bash
ping 10.x.x.x
# or mesh SSH (no OpenSSH keys required)
tuntun ssh other-machine
```

## CLI reference

Global flags: `--state-dir`, `--json-logs`.

| Command | Description |
|---------|-------------|
| `tuntun enroll` | Register this machine with the control plane |
| `tuntun run` | Start the agent (TUN + mesh) |
| `tuntun reset --yes` | Wipe local agent state |
| `tuntun status [--peers]` | Agent / network status |
| `tuntun ping <peer>` | Mesh RTT over QUIC |
| `tuntun dns status` | PeerDNS configuration and cache |
| `tuntun route list` | Active subnet / hostname / exit routes |
| `tuntun route add <cidr>` | Advertise a subnet from this machine |
| `tuntun diag` | Full connectivity diagnostics |
| `tuntun netcheck` | Quick pass/fail connectivity check |
| `tuntun serve <port>` | Expose a local port on the mesh |
| `tuntun tunnel <port>` | Expose a local port via a public relay |
| `tuntun send <path> <target>` | P2P send a file/dir to a peer or `tag:name` |
| `tuntun send list` | Active / pending transfers |
| `tuntun send accept / reject <id>` | Respond to a pending offer |
| `tuntun send history` | Past transfers |
| `tuntun send config` | Consent mode, inbox path, pin blobs |
| `tuntun ssh <target>` | Identity-based SSH to a peer |
| `tuntun ssh sessions` | List SSH sessions |
| `tuntun ssh recordings` | List session recordings |
| `tuntun ssh play <id>` | Replay a recording |
| `tuntun login` | Sign in to management (device auth) |
| `tuntun logout` | Clear stored management tokens |

Serve and tunnel stay inside the mesh vs go public through a relay, respectively. Both can also be created from the dashboard. Send moves files peer-to-peer on the mesh; manage consent and history under **Transfers**.

## Relays (public tunnels)

1. Create a relay registration token in the dashboard (**Relays**).
2. Register and run:

```bash
tuntun-relay register --control-url http://your-control-host:8080 --token TOKEN
tuntun-relay run
```

1. Point DNS at the relay and create tunnels (`tuntun tunnel` or the dashboard).

See `tuntun-relay --help` for HTTPS bind, certificates, and ACME options.

## A note to Tailscale

You have built something excellent. We are literally trying to compete with you while openly admitting you are about ten percent ahead.

If you are reading this: consider sponsoring TunTun. Just for the irony. We would put your logo somewhere prominent with great sincerity.

## License

See [LICENSE](LICENSE) for license details.
