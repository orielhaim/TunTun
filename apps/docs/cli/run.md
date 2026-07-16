# tunnet run

Start the Tunnet agent. Creates the virtual TUN interface, connects to peers, and begins handling mesh traffic, serves, tunnels, file transfers, and policies.

## Usage

```bash
sudo tunnet run [options]
```

## Options

| Option | Env | Default | Description |
|--------|-----|---------|-------------|
| `--ifname` | `TUNNET_IFNAME` | `tunnet0` | TUN interface name |
| `--poll-secs` | `TUNNET_POLL_SECS` | `30` | Snapshot poll interval |
| `--metrics-bind` | `TUNNET_METRICS_BIND` | `127.0.0.1:9100` | Prometheus metrics endpoint |
| `--disable-gossip` | `TUNNET_DISABLE_GOSSIP` | `false` | Disable gossip presence |
| `--recorder` | `TUNNET_RECORDER` | `false` | Enable SSH session recording |

## Requirements

The agent needs root/admin privileges to create the TUN interface. On Linux, this means running with `sudo`. On Windows, run as Administrator with the Wintun driver installed.

## Behavior

The agent first unlocks sealed secrets (`state.enc`) and loads public state (`state.json`) plus `tunnet.toml`. In Managed mode, it connects to the control plane via WebSocket and receives the network snapshot. In Direct mode, it joins each network's iroh-docs membership document and discovers peers via DHT.

It then creates the TUN interface, configures routing and DNS, starts the iroh endpoint, and enters its main event loop - handling packets, maintaining peer connections, and syncing configuration. If `[update].enabled` is set in `tunnet.toml`, it also runs the auto-update loop.
