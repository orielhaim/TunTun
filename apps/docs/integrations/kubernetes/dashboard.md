# Dashboard

Once the operator has enrolled connectors or proxies, use the Tunnet dashboard to confirm they are healthy and to jump into day-to-day mesh operations.

## Kubernetes page

Open **Kubernetes** in the sidebar.

- **Network cards** - Each Tunnet network that has Kubernetes nodes, with online / total counts. Open a card for that network’s cluster graph.
- **Nodes table** - Name, kind (connector, ingress proxy, tunnel proxy, egress proxy, …), network, mesh IP, presence, and advertised route count.
- **Node detail** - Click a row for routes, serves/tunnels counts, and links to machine detail, the cluster graph, or the full network Mesh.

Kinds you may see:

| Kind | Typical source |
| --- | --- |
| Connector | `TunnetConnector` |
| Ingress proxy | `TunnetIngress` |
| Tunnel proxy | `TunnetTunnel` |
| Egress proxy | `TunnetEgress` |
| Sidecar | Pod annotated with `tunnet.io/inject` |

## Cluster graph

**Kubernetes → (network)** shows topology for operator-managed nodes on that network: connectors, proxies, and the subnet routes they advertise. Use **Open Mesh** when you want the full network view (agents, SDK nodes, routes, and policies together).

## Machines and Mesh

Operator-managed nodes also appear under **Machines** (filter by type **Kubernetes**) and on the network **Mesh** tab (filter **Kubernetes**). From machine detail you can open Mesh or inspect routes the same way as for a normal agent.

Use Mesh for access policies, enrollment of non-Kubernetes machines, and network-wide routes. Use the Kubernetes pages when you care specifically about cluster-connected nodes.

## What success looks like

1. Connector Ready in `kubectl get tnc`.
2. Dashboard **Kubernetes** shows the connector **Online** with the expected mesh IP.
3. Advertised CIDRs appear on the node and on **Networks → Routes** (or Mesh routes).
4. A peer outside the cluster can reach a pod IP in an advertised range, or a Serve/Tunnel hostname/URL as configured.
