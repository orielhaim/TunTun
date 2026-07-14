# tuntun status

Show agent and network status.

## Usage

```bash
tuntun status [--peers]
```

## Options

| Option | Description |
|--------|-------------|
| `--peers` | Include detailed peer connection information |

## Output

Shows the agent's endpoint ID, assigned mesh IP, network name, mode (managed/direct), and control plane connectivity. With `--peers`, also lists all connected peers with their IPs, hostnames, and connection status.
