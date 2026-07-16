# Session Recording

SSH session recording captures the terminal output of SSH sessions for audit and compliance purposes.

## Enabling recording

Recording is enabled per-machine by starting the agent with the `--recorder` flag:

```bash
sudo tunnet run --recorder
```

Or via the environment variable:

```bash
TUNNET_RECORDER=1 sudo tunnet run
```

## Recording rules

Recording can also be enforced through SSH policies configured in **Networks → Access → SSH Rules**. These rules can mandate recording for specific tags, users, or all sessions.

## Replaying sessions

```bash
# List all recordings
tunnet ssh recordings

# Play a recording
tunnet ssh play <session_id>
```

Recordings are also viewable in the dashboard under **SSH → Recordings**.
