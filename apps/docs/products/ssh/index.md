# SSH

TunTun provides identity-based SSH over the mesh. No SSH keys to distribute, no authorized_keys to manage. Authentication is tied to TunTun identity and organization policies.

## Quick start

```bash
# SSH to a peer
tuntun ssh db-server

# SSH as root
tuntun ssh db-server -u root

# Run a command
tuntun ssh db-server -- uname -a

# View sessions
tuntun ssh sessions

# View and replay recordings
tuntun ssh recordings
tuntun ssh play <session_id>
```

## How it works

When you run `tuntun ssh db-server`, the agent opens a QUIC stream to the target peer using the SSH ALPN (`tuntun/ssh/1`). The target peer's agent spawns a PTY session and bridges the stream to it. The user's identity is verified by the TunTun control plane - no traditional SSH key exchange.

Sessions and recordings appear in the dashboard under **SSH**.

## Session recording

Enable inbound session recording on a machine with:

```bash
sudo tuntun run --recorder
# or
TUNTUN_RECORDER=1 sudo tuntun run
```

When recording is enabled, the target machine streams the session data to the control plane using the recording ALPN. Recorded sessions can be replayed with `tuntun ssh play <session_id>` or viewed in the dashboard.
