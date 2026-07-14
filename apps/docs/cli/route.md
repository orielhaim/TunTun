# tuntun route

Manage subnet, hostname, and exit routes.

## Usage

```bash
tuntun route list
tuntun route add <cidr>
```

## Subcommands

`tuntun route list` shows all active routes visible to this machine - subnet routes, hostname routes, and exit routes.

`tuntun route add <cidr>` advertises a subnet from this machine. Other peers on the mesh can then reach the specified CIDR through this machine.

## Example

```bash
# List routes
tuntun route list

# Advertise a local subnet
tuntun route add 192.168.1.0/24
```
