# tunnet service

Install and manage Tunnet as an OS service (systemd on Linux, launchd on macOS, Windows Service on Windows).

## Usage

```bash
tunnet service install     # Write the service unit (needs root/admin)
tunnet service uninstall   # Remove the service unit
tunnet service start       # Start the daemon
tunnet service stop        # Stop the daemon
tunnet service restart     # Restart the daemon
tunnet service status      # Show service status
```

## Notes

`tunnet service install` creates the appropriate service configuration for your OS. After installation, the agent runs as a background daemon and starts automatically on boot.
