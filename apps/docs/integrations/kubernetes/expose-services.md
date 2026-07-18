# Expose Services

After a [connector](/integrations/kubernetes/connector) is on the mesh, use namespaced resources to publish Kubernetes Services to Tunnet peers, publish them publicly, or reach mesh hosts from inside the cluster.

All of these resources need a `networkRef` (network name or ID). They use the operator credentials unless you set `authSecretRef`.

## Serve a Service on the mesh (`TunnetIngress`)

[`Serve`](/products/serve/) exposes a Service to other mesh peers with an internal hostname (and optional ACLs / org CA TLS).

```yaml
apiVersion: tunnet.io/v1alpha1
kind: TunnetIngress
metadata:
  name: api
  namespace: default
spec:
  networkRef:
    name: production
  service:
    name: api
    port: 8080
  serve:
    hostname: api.internal
    protocol: https
    tls:
      fromOrgCa: true
    acl:
      mode: all_peers
```

Apply and wait until Ready:

```bash
kubectl apply -f ingress.yaml
kubectl get tni -n default
```

Peers can reach the service via the mesh hostname (PeerDNS) once the ingress is Ready. Status includes `meshHostname` and `meshIp` when available.

### ACL modes

| `serve.acl.mode` | Behavior |
| --- | --- |
| `all_peers` | Any peer on the network may connect (default) |
| (with `allowTags`) | Restrict to peers that carry the listed tags |

## Public HTTPS (`TunnetTunnel`)

[`Tunnel`](/products/tunnel/) gives a Service a public URL through a Tunnet relay.

```yaml
apiVersion: tunnet.io/v1alpha1
kind: TunnetTunnel
metadata:
  name: demo-api
  namespace: default
spec:
  networkRef:
    name: production
  service:
    name: api
    port: 8080
  tunnel:
    protocol: https
    # subdomain: optional preferred subdomain
    # relayUrl: optional specific relay
    # customDomain: optional custom hostname
```

```bash
kubectl apply -f tunnel.yaml
kubectl get tnt -n default
```

When Ready, `.status.publicUrl` holds the public HTTPS URL.

Path-based redirects use `tunnel.redirectRules` (same idea as dashboard tunnel redirects):

```yaml
tunnel:
  protocol: https
  redirectRules:
    - pathPattern: "/v2/*"
      targetPort: 8081
```

## Call the mesh from the cluster (`TunnetEgress`)

Egress creates a cluster Service that forwards to a mesh peer (by hostname, mesh IP, or endpoint ID).

```yaml
apiVersion: tunnet.io/v1alpha1
kind: TunnetEgress
metadata:
  name: db-on-mesh
  namespace: default
spec:
  networkRef:
    name: production
  target:
    hostname: db.production
    port: 5432
  clusterService:
    name: mesh-db
    port: 5432
```

Pods in the namespace can use `mesh-db:5432` (or the Service DNS name) to reach the mesh target.

```bash
kubectl apply -f egress.yaml
kubectl get tne -n default
```

## Optional: proxy groups and classes

For higher availability or shared proxy pools:

- **`TunnetProxyGroup`** — pool of proxy replicas for a type (`ingress`, `egress`, `connector`, or `tunnel`), tied to a network
- **`TunnetProxyClass`** — pod defaults (resources, nodeSelector, tolerations, metrics)

Reference them from connectors / ingresses / tunnels / egresses with `proxyGroupRef` / `proxyClassRef` when you outgrow the defaults. For a first install, the operator’s built-in pods are enough.

## Optional: sidecar injection

When the operator webhook is enabled (default), annotate a Pod (or pod template) to inject a Tunnet sidecar:

```yaml
metadata:
  annotations:
    tunnet.io/inject: "true"   # or "enabled"
    tunnet.io/hostname: my-app # optional mesh hostname
    tunnet.io/tags: "app,k8s"  # optional comma-separated tags
```

Use this when a specific workload should join the mesh as its own node. Prefer a [connector](/integrations/kubernetes/connector) plus CIDR routes when you want the whole cluster (or large CIDRs) reachable without annotating every Deployment.

## Troubleshooting checklist

1. Connector for the same network is Ready and advertising the CIDRs you expect.
2. Service name/port match an existing Service in the same namespace.
3. API key still valid; operator Secret URLs reachable from the cluster.
4. Dashboard **Kubernetes** page shows the node online (see [Dashboard](/integrations/kubernetes/dashboard)).
