# tuntun service

Install and manage TunTun as an OS service (systemd on Linux, launchd on macOS, Windows Service on Windows).

## Usage

```bash
tuntun service install     # Write the service unit (needs root/admin)
tuntun service uninstall   # Remove the service unit
tuntun service start       # Start the daemon
tuntun service stop        # Stop the daemon
tuntun service restart     # Restart the daemon
tuntun service status      # Show service status
```

## Notes

`tuntun service install` creates the appropriate service configuration for your OS. After installation, the agent runs as a background daemon and starts automatically on boot.
