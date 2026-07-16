# Diagnostics

Tunnet provides several tools for troubleshooting mesh connectivity.

## tunnet status

Shows agent status, assigned IP, network membership, and optionally peer connection details:

```bash
tunnet status
tunnet status --peers
```

## tunnet ping

Measures mesh round-trip time to a peer over QUIC:

```bash
tunnet ping db-server
tunnet ping 10.7.0.5
```

## tunnet diag

Full connectivity diagnostics - tests control plane connectivity, peer reachability, DNS resolution, and route table consistency:

```bash
tunnet diag
```

## tunnet netcheck

Quick pass/fail connectivity check:

```bash
tunnet netcheck
```

## Metrics

The agent exports Prometheus metrics on a configurable bind address (default `127.0.0.1:9100`). Metrics include connection counts, packet counters, bandwidth, latency histograms, and error rates.
