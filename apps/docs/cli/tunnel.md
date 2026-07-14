# tuntun tunnel

Expose a local port to the public internet via a relay.

## Usage

```bash
tuntun tunnel <port>
tuntun tunnel status
tuntun tunnel off <port>
```

## Subcommands

`tuntun tunnel <port>` creates a public HTTPS tunnel for the specified local port. Outputs the public URL.

`tuntun tunnel status` shows all active tunnels with their public URLs.

`tuntun tunnel off <port>` tears down the tunnel for the specified port.

## Example

```bash
# Create a public tunnel
$ tuntun tunnel 3000
Tunnel active: https://abc123.relay.example.com → localhost:3000

# Check status
tuntun tunnel status

# Tear down
tuntun tunnel off 3000
```
