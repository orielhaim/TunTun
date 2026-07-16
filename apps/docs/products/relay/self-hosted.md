# Self-Hosted Relay Setup

## 1. Register the relay

In the dashboard, navigate to **Relays** and create a relay registration token.

## 2. Register and run

```bash
tunnet-relay register \
  --control-url http://your-control-host:8080 \
  --token YOUR_RELAY_TOKEN

tunnet-relay run
```

## 3. Configure DNS

Point your tunnel domain (e.g., `*.tunnel.example.com`) at the relay server's public IP.

## 4. Configure HTTPS

The relay binds an HTTPS listener for public traffic. You can provide TLS certificates in several ways: with `--cert-file` and `--key-file` flags for your own certificates, or by enabling ACME (Let's Encrypt) for automatic provisioning.

## Options

See `tunnet-relay --help` for all available options including HTTPS bind address, ACME configuration, and certificate paths.
