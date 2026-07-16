# tunnet serve

Expose a local port to other machines on the mesh.

## Usage

```bash
tunnet serve <port>
tunnet serve status
tunnet serve off <port>
```

## Subcommands

`tunnet serve <port>` starts serving the specified local port on the mesh. Other peers can reach it via your mesh hostname with TLS.

`tunnet serve status` shows all ports currently being served.

`tunnet serve off <port>` stops serving the specified port.

## Example

```bash
# Serve a local development server
tunnet serve 3000

# Check what's being served
tunnet serve status

# Stop serving
tunnet serve off 3000
```
