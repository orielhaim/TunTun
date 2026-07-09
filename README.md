# TunTun

[![Status](https://img.shields.io/badge/status-in%20development-orange?style=flat-square)](https://github.com/orielhaim/TunTun)
[![Discord](https://img.shields.io/badge/discord-join%20server-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.gg/y5bNc3MYKz)

TunTun connects your machines into a private network, the kind you would normally build inside an office or a data center. Install an agent on each device, and it gets an internal IP address. After that, ordinary tools just work - SSH, ping, curl, a browser pointed at an internal service. You do not need to teach every application about tunnels or VPNs. The network is the network.

That is the whole idea: a mesh for people who want their stuff to talk to their other stuff, wherever it happens to be sitting.

## Why this exists

Most teams eventually need something like this. Developers want to reach a machine at home from a laptop in a café. A small company wants its servers to behave like they share a LAN even when they do not. Someone needs to open an admin panel that was never meant to face the public internet.

Commercial options exist. Tailscale is the obvious one, and they are very good at what they do. TunTun is meant to be a direct competitor to that model - same general problem, same general shape, a private overlay network you can actually use.

We should be honest about where we stand: they are ahead of us by roughly ten percent, and the gap is not closing as fast as our pride would prefer. We are building anyway, because we think the category needs an alternative that is fully open.

## What makes TunTun different

**Everything is open source.** Not just the agent on your laptop. The control plane, the coordination layer, the management tooling - all of it. You can read it, run it yourself, fork it, and know exactly what your network is doing. No hosted black box you have to trust because the marketing page said so.

**No WireGuard workarounds.** TunTun is built on iroh and QUIC datagrams instead of riding on WireGuard or userspace WireGuard stacks with years of vendor-specific tuning layered on top. That is a deliberate choice. We want a networking stack we own end to end, not a tunnel protocol we are forever trying to catch up with.

Traffic between peers is encrypted. NAT traversal is handled in the stack. When a direct path is not available, relays can carry the connection. The boring parts are supposed to be boring so the useful part - your machines talking to each other by IP - stays simple.

## Who this is for

TunTun is for people who want a private internal network without handing the keys to a closed platform. Self-hosters, small teams, anyone who has looked at mesh VPN products and thought: *I would use this, but I want to see the control server too.*

It is early. Some things are still rough. The control plane does not yet have every policy knob a mature product accumulates over years. Performance tuning is ongoing. If you need something battle-tested today for a large organization with strict compliance requirements, Tailscale is probably the safer bet. We know that. We are not pretending otherwise.

If you want to follow along, run it yourself, or contribute - welcome.

## Installation

You need Rust 1.96 or newer, Bun, and PostgreSQL. The agent also needs permission to create a virtual network interface: root on Linux and macOS, Administrator on Windows (with the Wintun driver installed).

Build the Rust binaries from the repository root:

```bash
cargo build --release
```

The two binaries you care about are `tuntun-control` (coordination server) and `tuntun-agent` (runs on each machine).

### Running the control stack

TunTun is not just the agent. To manage networks you also run the control plane, the management API, and the web dashboard. All of them share a PostgreSQL database.

Create a `.env` file at the repository root with at least:

```
DATABASE_URL=postgres://user:pass@localhost:5432/tuntun
TUNTUN_SERVICE_SECRET=a-long-random-string-at-least-32-characters
CONTROL_PLANE_ADMIN_URL=http://127.0.0.1:9091
VITE_MANAGEMENT_API_URL=http://localhost:3000
```

Apply the database schema:

```bash
bun install
bun run db:migrate
```

Start each service in its own terminal:

```bash
# Control plane (agents connect here on port 8080)
./target/release/tuntun-control

# Management API
bun run dev:management

# Dashboard
bun run dev:dash
```

Open the dashboard, create an account and organization, and you will get a default network. From the Machines page you can generate an enrollment token.

## Adding a machine

Every device joins in two steps: enroll once, then run.

### Enroll

Enrollment registers the machine with the control plane, assigns it an internal IP, and saves credentials locally. You need an enrollment token from the dashboard (or the script above) and the URL where `tuntun-control` is reachable.

```bash
sudo tuntun-agent enroll \
  --control-url http://your-control-host:8080 \
  --token YOUR_ENROLLMENT_TOKEN
```

Optional flags:

- `--hostname` - name shown in the dashboard (defaults to the system hostname)
- `--state-dir` - where local credentials are stored (defaults to `~/.local/state/tuntun` on Linux)

You can also set `TUNTUN_CONTROL_URL` and `TUNTUN_ENROLL_TOKEN` instead of passing flags.

On success you will see the assigned IP and network name. Enrollment only needs to happen once per machine.

### Run

After enrollment, start the tunnel:

```bash
sudo tuntun-agent run
```

This creates the virtual interface (default name `tuntun0`), connects to peers, and keeps routing updated. Ordinary traffic to other machines on the network goes through the tunnel automatically.

Useful options:

- `--ifname tuntun0` - interface name
- `--poll-secs 30` - how often to check for routing changes

Set `RUST_LOG=debug` if something is not connecting and you want more detail in the logs.

### Reset

To wipe local state and enroll again:

```bash
tuntun-agent reset --yes
```

### Check that it works

From another enrolled machine, try reaching the assigned IP:

```bash
ping 10.x.x.x
ssh user@10.x.x.x
```

If ping works, the network is doing its job.

## A note to Tailscale

You have built something excellent. We are literally trying to compete with you while openly admitting you are about ten percent ahead.

If you are reading this: consider sponsoring TunTun. Just for the irony. We would put your logo somewhere prominent with great sincerity.

## License

See [LICENSE](LICENSE) for license details
