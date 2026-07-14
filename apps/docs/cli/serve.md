# tuntun serve

Expose a local port to other machines on the mesh.

## Usage

```bash
tuntun serve <port>
tuntun serve status
tuntun serve off <port>
```

## Subcommands

`tuntun serve <port>` starts serving the specified local port on the mesh. Other peers can reach it via your mesh hostname with TLS.

`tuntun serve status` shows all ports currently being served.

`tuntun serve off <port>` stops serving the specified port.

## Example

```bash
# Serve a local development server
tuntun serve 3000

# Check what's being served
tuntun serve status

# Stop serving
tuntun serve off 3000
```
