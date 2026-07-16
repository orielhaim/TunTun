# SSH

Tunnet provides identity-based SSH over the mesh. No SSH keys to distribute, no authorized_keys to manage. Authentication is tied to Tunnet identity and organization policies.

## Quick start

```bash
# SSH to a peer
tunnet ssh db-server

# SSH as root
tunnet ssh db-server -u root

# Run a command
tunnet ssh db-server -- uname -a

# View sessions
tunnet ssh sessions

# View and replay recordings
tunnet ssh recordings
tunnet ssh play <session_id>
```

## How it works

When you run `tunnet ssh db-server`, the agent opens a QUIC stream to the target peer using the SSH ALPN (`tunnet/ssh/1`). The target peer's agent spawns a PTY session and bridges the stream to it. The user's identity is verified by the Tunnet control plane - no traditional SSH key exchange.

Sessions and recordings appear in the dashboard under **SSH**.

## Session recording

Enable inbound session recording on a machine with:

```bash
sudo tunnet run --recorder
# or
TUNNET_RECORDER=1 sudo tunnet run
```

When recording is enabled, the target machine streams the session data to the control plane using the recording ALPN. Recorded sessions can be replayed with `tunnet ssh play <session_id>` or viewed in the dashboard.
