# tuntun-relay

The relay is a separate binary (`tuntun-relay`) for running self-hosted public tunnel edge servers.

## Commands

```bash
# Register with the control plane
tuntun-relay register \
  --control-url http://control:8080 \
  --token RELAY_TOKEN

# Run the relay
tuntun-relay run
```

## Options

See `tuntun-relay --help` for all options including HTTPS bind address, certificate files, and ACME configuration.
