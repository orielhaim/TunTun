# tunnet ssh

SSH to a peer over the mesh using Tunnet identity. Uses your system OpenSSH client under the hood.

Also see [SSH product overview](/products/ssh/) for stock `ssh` / `scp` / `sftp` against `*.tunnet`.

## Usage

```bash
tunnet ssh <target> [-u <user>] [-- <command>]
tunnet ssh sessions
tunnet ssh recordings
tunnet ssh play <session_id>
tunnet ssh config [--path <file>]
tunnet ssh-keyscan [targets...] [-f]
tunnet ssh-proxy <host> <port>
```

## Connect

| Option | Description |
|--------|-------------|
| `-u <user>` | Remote username (default: current user) |
| `-- <command>` | Run a command instead of an interactive shell |

```bash
# Interactive session
tunnet ssh db-server

# As root
tunnet ssh db-server -u root

# One-shot command
tunnet ssh db-server -- uname -a
```

Targets can be a hostname, mesh IP, or `hostname.tunnet` name.

## Config for stock OpenSSH

Writes (or updates) a marked `# BEGIN TUNNET` … `# END TUNNET` block in your OpenSSH config so `Host *.tunnet` routes through Tunnet:

```bash
tunnet ssh config

# Custom path
tunnet ssh config --path ~/.ssh/config
```

After this, normal clients work without remembering Tunnet-specific flags:

```bash
ssh alice@db-server.tunnet
```

## Host keys

```bash
# Print keys for peers that advertise them
tunnet ssh-keyscan

# One peer
tunnet ssh-keyscan db-server

# Also write into Tunnet’s known_hosts file
tunnet ssh-keyscan -f
```

## Sessions and recordings

```bash
tunnet ssh sessions
tunnet ssh recordings
tunnet ssh play <session_id>
```

## ssh-proxy

OpenSSH ProxyCommand helper used by `tunnet ssh` and by `tunnet ssh config`. You normally do not run this yourself:

```text
ProxyCommand=tunnet ssh-proxy %h %p
```
