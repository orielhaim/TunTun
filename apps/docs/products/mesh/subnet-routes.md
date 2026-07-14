# Subnet Routes

Subnet routes let you make entire LAN segments reachable from the mesh without installing the TunTun agent on every device.

## Use cases

You have a NAS at 192.168.1.100 on your home network. A printer at 192.168.1.50. A legacy server that cannot run new software. By advertising the 192.168.1.0/24 subnet from a machine that has the TunTun agent, all of those devices become reachable from any peer on the mesh.

## Advertising a route

From the gateway machine (a machine on both the mesh and the target LAN):

```bash
tuntun route add 192.168.1.0/24
```

Or from the dashboard: **Networks → Routes → Add route**.

The control plane adds the route to the network snapshot. All peers receive the updated snapshot and add the route to their local routing tables.

## How traffic flows

When a peer sends a packet to 192.168.1.100, the routing table matches the 192.168.1.0/24 route and forwards the packet over the mesh to the gateway machine. The gateway receives the packet, strips the mesh encapsulation, and forwards it to the actual LAN. Return traffic follows the reverse path.

## Managing routes

```bash
tuntun route list
```

This shows all active subnet routes, hostname routes, and exit routes visible to the current machine.
