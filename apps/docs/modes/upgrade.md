# Upgrading Direct to Managed

When you outgrow Direct mode and need centralized management, you can migrate to Managed mode:

```bash
tuntun upgrade-to-managed \
  --control-url http://your-control-host:8080 \
  --token YOUR_ENROLLMENT_TOKEN
```

This registers the existing machine with the control plane, preserving its identity. The machine transitions from using the iroh-docs membership document to receiving its configuration from the control plane.

After upgrading, you get access to the full managed feature set: dashboard, SSO, access policies, tunnels, relays, and more.

::: warning
The upgrade is one-way. Once a machine moves to managed mode, it cannot return to direct mode without a reset (`tuntun reset --yes`).
:::
