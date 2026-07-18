# Access Policies & ACLs

Tunnet enforces access control at two levels: organization-wide policies and per-network policies. Policies define which peers can communicate with which other peers, and optionally restrict communication to specific ports or protocols.

## Policy structure

A policy is a collection of rules. Each rule specifies a source (who is initiating the connection), a destination (who is being connected to), and optionally ports and protocols. Sources and destinations can be specified as tags, specific machine endpoint IDs, or CIDR ranges.

Policies are configured in the dashboard under **Access** (org-wide) and **Networks → Access** (per-network).

## Tag-based ACLs

The most common pattern is tag-based access control. You assign tags to machines, then write policies like:

- Machines tagged `engineering` can reach machines tagged `staging` on any port
- Machines tagged `monitoring` can reach all machines on ports 9090 and 9100
- Machines tagged `database` can only be reached from machines tagged `backend`

## ACL enforcement

The ACL engine runs on every agent. When a packet arrives at the TUN interface destined for a peer, the agent checks the policy before forwarding. If the policy denies the connection, the packet is dropped locally. This means enforcement happens at the source, not the destination - there is no way to bypass it by reaching the destination through some other path on the mesh.

## SSH policies

SSH access has its own policy layer configured under **Networks → Access → SSH Rules**. These rules apply whether you connect with `tunnet ssh` or stock OpenSSH. SSH policies can require re-authentication (check mode), where the user must confirm their identity through a browser flow before the session is established. They can also mandate session recording.

## Device posture

Policies can also require the *source device* to pass named device posture definitions (for example disk encryption and firewall enabled). Agents collect attributes locally; the control plane evaluates definitions and feeds the result into ACL checks. Org settings choose monitor, warn, or enforce modes.

Configure definitions and compliance under **Security → Posture** in the dashboard.
