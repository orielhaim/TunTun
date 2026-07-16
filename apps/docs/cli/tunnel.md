# tunnet tunnel

Expose a local port to the public internet via a relay.

## Usage

```bash
tunnet tunnel <port>
tunnet tunnel status
tunnet tunnel off <port>
```

## Subcommands

`tunnet tunnel <port>` creates a public HTTPS tunnel for the specified local port. Outputs the public URL.

`tunnet tunnel status` shows all active tunnels with their public URLs.

`tunnet tunnel off <port>` tears down the tunnel for the specified port.

## Example

```bash
# Create a public tunnel
$ tunnet tunnel 3000
Tunnel active: https://abc123.relay.example.com → localhost:3000

# Check status
tunnet tunnel status

# Tear down
tunnet tunnel off 3000
```
