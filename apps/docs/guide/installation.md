# Installation

Install the Tunnet agent on every machine you want on the mesh.

<InstallPicker compact />

## What to do next

**Join a managed network** (control plane + dashboard):

```bash
sudo tunnet enroll --control-url http://your-host:8080 --token YOUR_TOKEN
sudo tunnet service start
```

**Or start a Direct network** (no server):

```bash
sudo tunnet create --name my-net --secret "a-strong-passphrase"
sudo tunnet service start
```

See [Quick Start (Managed)](/guide/quickstart-managed) or [Quick Start (Direct)](/guide/quickstart-direct).

Agent config lands in `tunnet.toml` next to sealed secrets in the state directory. See [Configuration](/guide/configuration).

## Options

Pin a version:

```bash
curl -fsSL https://github.com/tunnetio/Tunnet/releases/latest/download/install.sh | sh -s -- --version v0.3.0
```

```powershell
# Download install.ps1 from the latest release, then:
.\install.ps1 -Version v0.3.0
```

Skip the service unit:

```bash
curl -fsSL https://github.com/tunnetio/Tunnet/releases/latest/download/install.sh | sh -s -- --no-service
```

```powershell
.\install.ps1 -NoService
```

## Updating

```bash
sudo tunnet update
```

On Linux this reloads the agent gracefully by default. Pass `--restart` for a full service restart. Use `tunnet update --check` to only look for a newer release.

For unattended upgrades, enable `[update]` in `tunnet.toml` (see [tunnet update](/cli/update)).

## Building from source

If you are developing Tunnet or self-hosting the full stack from a checkout:

```bash
git clone https://github.com/tunnetio/Tunnet.git
cd Tunnet
cargo build --release
```

Binaries land in `target/release/`. For the management API and dashboard, also run `bun install` and see [Self-Hosting](/self-hosting/).

## Platform notes

- **Linux** - root (or `CAP_NET_ADMIN`) for the TUN interface.
- **macOS** - admin privileges for the TUN interface.
- **Windows** - Administrator privileges and the [Wintun](https://www.wintun.net/) driver.
- **Containers / CI** - pass `--no-encrypt-state` (or `TUNNET_NO_ENCRYPT_STATE=1`) if platform secret sealing is unavailable.
