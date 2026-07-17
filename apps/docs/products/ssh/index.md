# SSH

Tunnet provides identity-based SSH over the mesh. No SSH keys to distribute, no `authorized_keys` to manage. Access is tied to Tunnet identity and organization policies.

You can use Tunnet’s CLI wrapper, or your normal OpenSSH client (`ssh`, `scp`, `sftp`) against `*.tunnet` hostnames.

## Quick start

```bash
# SSH to a peer
tunnet ssh db-server

# SSH as a specific user
tunnet ssh db-server -u root

# Run a command
tunnet ssh db-server -- uname -a

# Use stock OpenSSH with mesh DNS
ssh user@db-server.tunnet

# Optional: write a Host *.tunnet block to ~/.ssh/config
tunnet ssh config
```

## How it works

SSH traffic travels over the Tunnet mesh like any other TCP service. Peers authenticate with Tunnet identity. there is no separate SSH key exchange to manage.

Sessions and recordings appear in the dashboard under **SSH**.

## Using stock OpenSSH

After the agent is up and PeerDNS resolves mesh names, stock clients work against `hostname.tunnet`:

```bash
ssh alice@db-server.tunnet
scp ./file alice@db-server.tunnet:~/
sftp alice@db-server.tunnet
```

For laptops that are on the mesh but should always go through Tunnet’s helper (recommended), run:

```bash
tunnet ssh config
```

That adds a marked block to `~/.ssh/config` so `Host *.tunnet` uses Tunnet’s ProxyCommand and known_hosts file. You can re-run the command anytime to refresh the block.

List advertised host keys (and optionally write them locally):

```bash
tunnet ssh-keyscan
tunnet ssh-keyscan db-server -f
```

## Session recording

Enable inbound session recording on a machine with:

```bash
sudo tunnet run --recorder
# or
TUNNET_RECORDER=1 sudo tunnet run
```

Recorded sessions can be replayed with `tunnet ssh play <session_id>` or viewed in the dashboard.

## Related

- [Session Recording](/products/ssh/recording)
- [SSH Policies & Re-Auth](/products/ssh/policies)
- [`tunnet ssh` CLI](/cli/ssh)
