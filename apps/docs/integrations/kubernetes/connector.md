# Connect a Cluster

A **TunnetConnector** enrolls one or more connector pods into a Tunnet network and advertises cluster (or custom) CIDRs as subnet routes. After it is Ready, mesh peers can reach those ranges through the connector - the same idea as a [subnet route gateway](/products/mesh/subnet-routes) on a VM, but managed by Kubernetes.

## Minimal example

```yaml
apiVersion: tunnet.io/v1alpha1
kind: TunnetConnector
metadata:
  name: production-cluster
spec:
  networkRef:
    name: production   # or use id: <network-uuid>
  subnetRouter:
    autoDiscoverClusterCidrs: true
    routes: []
  replicas: 1
```

Apply it:

```bash
kubectl apply -f connector.yaml
kubectl get tunnetconnectors
# short name:
kubectl get tnc
```

When Ready, the status shows enrolled nodes (hostname, mesh IP) and advertised routes.

```bash
kubectl describe tnc production-cluster
```

## Spec fields

| Field | Required | Description |
| --- | --- | --- |
| `networkRef.name` or `networkRef.id` | Yes | Tunnet network to join |
| `subnetRouter.routes` | Yes (may be empty) | Extra CIDRs to advertise (e.g. `10.244.0.0/16`) |
| `subnetRouter.autoDiscoverClusterCidrs` | No | When `true`, discover and advertise cluster pod/Service CIDRs |
| `replicas` | No | Connector pods (default `1`) |
| `hostname` | No | Preferred hostname on the mesh |
| `tags` / `labels` | No | Tags and labels applied to the enrolled node |
| `exitNode` | No | Advertise as an exit node when `true` |
| `authSecretRef` | No | Alternate credentials Secret (defaults to the operator Secret) |
| `controlUrl` / `managementUrl` | No | Override URLs from the operator Secret |

## Explicit routes

If you prefer not to auto-discover:

```yaml
spec:
  networkRef:
    name: production
  subnetRouter:
    autoDiscoverClusterCidrs: false
    routes:
      - 10.244.0.0/16
      - 10.96.0.0/12
```

Only advertise ranges you intend peers to use. Overly broad or invalid CIDRs confuse routing and are harder to reason about in the dashboard.

## Credentials

By default the connector uses the operator’s `tunnet-operator-credentials` Secret. To use a different Secret (for example per-environment keys):

```yaml
spec:
  authSecretRef:
    name: staging-tunnet-creds
    namespace: tunnet-system
  networkRef:
    name: staging
  subnetRouter:
    autoDiscoverClusterCidrs: true
    routes: []
```

The Secret must contain `api_key`, `org_id`, `control_url`, and `management_url`.

## Check readiness

```bash
kubectl get tnc production-cluster -o wide
```

Look for Ready in the printer columns and conditions of type `ConnectorReady`. Mesh IPs appear under `.status.nodes`.

From a peer on the same Tunnet network:

```bash
tunnet status --peers
# Reach a pod IP in an advertised CIDR, or the connector’s mesh IP
```

## Next steps

- See connectors in the [dashboard](/integrations/kubernetes/dashboard)
- [Expose a Service](/integrations/kubernetes/expose-services) with Ingress or Tunnel
