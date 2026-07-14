# High Availability Gateways

When a gateway machine advertises a subnet or hostname route, that route depends on the gateway being online. If the gateway goes down, the route becomes unreachable.

HA gateways solve this by grouping multiple gateways together. If one gateway goes offline, another in the group takes over, and routes keep working with minimal disruption.

## Configuration

HA gateway groups are configured in the dashboard under **Networks → Routes**. You designate multiple machines as members of a gateway group, and the control plane monitors their availability, promoting a backup when the primary fails.
