# tunnet-relay

The relay is a separate binary (`tunnet-relay`) for running self-hosted public tunnel edge servers.

## Commands

```bash
# Register with the control plane
tunnet-relay register \
  --control-url http://control:8080 \
  --token RELAY_TOKEN

# Run the relay
tunnet-relay run
```

## Options

See `tunnet-relay --help` for all options including HTTPS bind address, certificate files, and ACME configuration.
