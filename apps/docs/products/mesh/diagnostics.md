# Diagnostics

TunTun provides several tools for troubleshooting mesh connectivity.

## tuntun status

Shows agent status, assigned IP, network membership, and optionally peer connection details:

```bash
tuntun status
tuntun status --peers
```

## tuntun ping

Measures mesh round-trip time to a peer over QUIC:

```bash
tuntun ping db-server
tuntun ping 10.7.0.5
```

## tuntun diag

Full connectivity diagnostics - tests control plane connectivity, peer reachability, DNS resolution, and route table consistency:

```bash
tuntun diag
```

## tuntun netcheck

Quick pass/fail connectivity check:

```bash
tuntun netcheck
```

## Metrics

The agent exports Prometheus metrics on a configurable bind address (default `127.0.0.1:9100`). Metrics include connection counts, packet counters, bandwidth, latency histograms, and error rates.
