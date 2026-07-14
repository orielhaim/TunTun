# tuntun ssh

SSH to a peer over the mesh using TunTun identity.

## Usage

```bash
tuntun ssh <target> [-u <user>] [-- <command>]
tuntun ssh sessions
tuntun ssh recordings
tuntun ssh play <session_id>
```

## Options

| Option | Description |
|--------|-------------|
| `-u <user>` | Remote username (default: current user) |
| `-- <command>` | Run a command instead of interactive shell |

## Examples

```bash
# Interactive SSH
tuntun ssh db-server

# SSH as root
tuntun ssh db-server -u root

# Run a command
tuntun ssh db-server -- uname -a

# View sessions and recordings
tuntun ssh sessions
tuntun ssh recordings
tuntun ssh play abc123
```
