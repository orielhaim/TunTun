# tuntun ping

Measure mesh round-trip time to a peer over QUIC.

## Usage

```bash
tuntun ping <peer>
```

`<peer>` can be a hostname, mesh IP, or endpoint ID.

## Example

```bash
$ tuntun ping db-server
PING db-server (10.7.0.5) via QUIC
64 bytes from 10.7.0.5: time=12.3ms
64 bytes from 10.7.0.5: time=11.8ms
```
