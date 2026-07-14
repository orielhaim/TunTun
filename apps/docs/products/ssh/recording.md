# Session Recording

SSH session recording captures the terminal output of SSH sessions for audit and compliance purposes.

## Enabling recording

Recording is enabled per-machine by starting the agent with the `--recorder` flag:

```bash
sudo tuntun run --recorder
```

Or via the environment variable:

```bash
TUNTUN_RECORDER=1 sudo tuntun run
```

## Recording rules

Recording can also be enforced through SSH policies configured in **Networks → Access → SSH Rules**. These rules can mandate recording for specific tags, users, or all sessions.

## Replaying sessions

```bash
# List all recordings
tuntun ssh recordings

# Play a recording
tuntun ssh play <session_id>
```

Recordings are also viewable in the dashboard under **SSH → Recordings**.
