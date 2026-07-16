# tunnet route

Manage subnet, hostname, and exit routes.

## Usage

```bash
tunnet route list
tunnet route add <cidr>
```

## Subcommands

`tunnet route list` shows all active routes visible to this machine - subnet routes, hostname routes, and exit routes.

`tunnet route add <cidr>` advertises a subnet from this machine. Other peers on the mesh can then reach the specified CIDR through this machine.

## Example

```bash
# List routes
tunnet route list

# Advertise a local subnet
tunnet route add 192.168.1.0/24
```
