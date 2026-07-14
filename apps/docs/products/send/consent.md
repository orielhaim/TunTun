# Consent Modes

TunTun Send supports three consent modes that control how incoming file offers are handled.

**prompt** (default): incoming offers are queued as pending. You must explicitly accept or reject each transfer with `tuntun send accept <id>` or `tuntun send reject <id>`. Exception: peers that share a tag with the receiver auto-accept.

**auto_accept**: all incoming offers are accepted automatically. Files are downloaded to the inbox without manual intervention.

**deny**: all incoming offers are rejected automatically. No files are received.

## Configuration

```bash
# View current config
tuntun send config

# Set consent mode
tuntun send config --consent prompt --inbox ~/TunTun/inbox
```

Consent mode can also be changed per-machine from the dashboard under **Transfers**.
