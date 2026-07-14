# Installation

TunTun has three components you may need to install depending on your role.

## Prerequisites

TunTun requires **Rust 1.96+**, **Bun**, and **PostgreSQL** (for the management/control plane). The agent itself only needs the Rust binary and root/admin privileges to create a TUN interface.

## Building from source

```bash
git clone https://github.com/orielhaim/TunTun.git
cd TunTun
cargo build --release
```

This produces three binaries in `target/release/`:

`tuntun` is the agent and CLI - this is what you install on every machine that joins the network. `tuntun-control` is the control plane server that coordinates managed networks. `tuntun-relay` is the optional edge relay for public tunnels.

## Setting up the management stack

If you are self-hosting (rather than joining an existing network), you also need the management API and dashboard:

```bash
bun install
bun run db:migrate
```

See the [Self-Hosting guide](/self-hosting/) for full configuration details.

## Platform-specific notes

On **Linux**, the agent needs `CAP_NET_ADMIN` capability or root access to create the `tuntun0` TUN interface.

On **macOS**, the agent needs root access. The TUN interface is created via the utun kernel driver.

On **Windows**, the agent needs Administrator privileges and the [Wintun](https://www.wintun.net/) driver installed. You can specify the path with `--wintun-file` or `TUNTUN_WINTUN_FILE`.
