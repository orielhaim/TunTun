# tunnet ssh

SSH to a peer over the mesh using Tunnet identity.

## Usage

```bash
tunnet ssh <target> [-u <user>] [-- <command>]
tunnet ssh sessions
tunnet ssh recordings
tunnet ssh play <session_id>
```

## Options

| Option | Description |
|--------|-------------|
| `-u <user>` | Remote username (default: current user) |
| `-- <command>` | Run a command instead of interactive shell |

## Examples

```bash
# Interactive SSH
tunnet ssh db-server

# SSH as root
tunnet ssh db-server -u root

# Run a command
tunnet ssh db-server -- uname -a

# View sessions and recordings
tunnet ssh sessions
tunnet ssh recordings
tunnet ssh play abc123
```
