# Install the Operator

The Tunnet Operator runs in your cluster, watches Tunnet custom resources, and manages the connector and proxy pods that talk to your Tunnet organization.

## 1. Create organization credentials

In the Tunnet dashboard:

1. Open **Organization → API keys** and create a key for the operator.
2. Note your **organization ID** (visible in organization settings).
3. Note your **control plane URL** and **management URL** (the endpoints agents and the operator use to reach Tunnet).

### API key scopes

| Scope | Dashboard label | When to use |
| --- | --- | --- |
| `sdk:enroll` | Enroll SDK nodes | Register connector and proxy nodes |
| `sdk:manage` | Manage SDK / K8s nodes | Enroll **and** remove nodes when you delete CRDs (recommended for the operator) |

Restrict the key to specific networks if you want, or allow all networks in the organization. Copy the secret once when it is created — it is not shown again.

Create a Kubernetes Secret in the operator namespace (default `tunnet-system`):

```bash
kubectl create namespace tunnet-system

kubectl -n tunnet-system create secret generic tunnet-operator-credentials \
  --from-literal=api_key='YOUR_API_KEY' \
  --from-literal=org_id='YOUR_ORG_ID' \
  --from-literal=control_url='https://control.example.com' \
  --from-literal=management_url='https://management.example.com'
```

Use the same URLs your agents use for enrollment. For local development they are often `http://host.docker.internal:8080` and `http://host.docker.internal:3000` (or your LAN IP), depending on how the cluster reaches your machine.

## 2. Install with Helm

From a checkout of the Tunnet repository:

```bash
helm upgrade --install tunnet-operator ./charts/tunnet-operator \
  --namespace tunnet-system \
  --create-namespace
```

The chart installs:

- The operator Deployment
- Tunnet CRDs (`TunnetConnector`, `TunnetIngress`, `TunnetTunnel`, `TunnetEgress`, and related types)
- RBAC and (by default) the mutating webhook used for optional pod injection

### Common values

| Value | Default | Meaning |
| --- | --- | --- |
| `credentials.secretName` | `tunnet-operator-credentials` | Secret with `api_key`, `org_id`, `control_url`, `management_url` |
| `credentials.create` | `false` | Set `true` only if you want Helm to create the Secret from values (prefer a manually created Secret in production) |
| `nodeExpiresIn` | `24h` | Inactivity window applied to operator-managed nodes |
| `image.operator.tag` / `image.kubeNode.tag` | chart `appVersion` | Operator and node images |
| `webhook.enabled` | `true` | Admission webhook |

Example override file:

```yaml
# values-override.yaml
credentials:
  secretName: tunnet-operator-credentials
nodeExpiresIn: "7d"
```

```bash
helm upgrade --install tunnet-operator ./charts/tunnet-operator \
  -n tunnet-system \
  -f values-override.yaml
```

## 3. Verify

```bash
kubectl -n tunnet-system get pods
kubectl get crd | grep tunnet.io
```

You should see the operator pod Running and CRDs such as `tunnetconnectors.tunnet.io`.

## Next step

Create a [TunnetConnector](/integrations/kubernetes/connector) so the cluster joins your mesh network.
