# tunnet enroll

Register this machine with a Tunnet control plane.

## Usage

```bash
sudo tunnet enroll --control-url <URL> --token <TOKEN>
sudo tunnet enroll --control-url <URL> --org <SLUG>
```

## Options

| Option | Env | Description |
|--------|-----|-------------|
| `--control-url` | `CONTROL_PLANE_URL` | Control plane URL (required) |
| `--token` | `TUNNET_ENROLL_TOKEN` | One-time enrollment token |
| `--org` | `TUNNET_ORG_SLUG` | Organization slug (quick enroll, requires approval) |
| `--network` | `TUNNET_NETWORK` | Network ID or name (defaults to "default") |
| `--hostname` | `TUNNET_HOSTNAME` | Hostname for this machine |
| `--wait-secs` | - | Quick enroll approval timeout (default: 600) |

## Token enrollment

With `--token`, the machine is immediately admitted to the network:

```bash
sudo tunnet enroll \
  --control-url http://control:8080 \
  --token eyJ...
```

## Quick enrollment

With `--org`, the machine enters a pending state and waits for admin approval:

```bash
sudo tunnet enroll \
  --control-url http://control:8080 \
  --org my-company \
  --wait-secs 300
```

## Notes

Enrollment only needs to happen once per machine. After enrollment, run `tunnet run` to start the agent. If the machine is already enrolled, the command will error. Use `tunnet reset --yes` to wipe state before re-enrolling.
