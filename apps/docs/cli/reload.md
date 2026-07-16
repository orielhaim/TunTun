# tunnet reload

Reload firewall, DNS, logging, and keep-alive settings from `tunnet.toml` without dropping mesh connections. The agent must be running.

```bash
tunnet reload
```

Prefer this over a full restart after editing config. Use `tunnet validate` first to catch errors. See [Configuration](/guide/configuration).
