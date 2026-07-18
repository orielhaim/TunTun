# Policy as Code

Define Tunnet access control in version-controlled files, review every change in a pull request, and apply the same policy through the CLI, Terraform, or CI. The dashboard stays available for day-to-day edits - both paths update the same live policy your agents enforce.

## What you can manage as code

Policy documents describe the same objects you configure in the dashboard:

- User groups and device groups
- Tags and tag ownership
- Host aliases and IP sets
- ACL rules and grants
- SSH rules and posture requirements
- Auto-approvers and node attributes
- Embedded **tests** that assert allow/deny outcomes

Agents always receive the current live policy from Tunnet. They do not pull from Git themselves - Git and Terraform are how *you* author and review changes.

## Policy formats

Author policy in any of:

| Format | Typical use |
| --- | --- |
| **HCL** (`.tunnet.hcl`) | Default for repos and CODEOWNERS-friendly fragments |
| **JSON** | API and automation |
| **YAML** | Teams that prefer YAML in Git |

The CLI auto-detects format from file extension and content. Export can target HCL, JSON, YAML, or Terraform.

## Multi-file layout

Keep a single root file or split ownership across directories. A common layout:

```text
.tunnet/
  policy.tunnet.hcl
  groups/
  tags/
  acls/
  grants/
  ssh/
  posture/
  tests/
```

Use `include` blocks (for example `include "groups/*"`) so teams can own fragments with CODEOWNERS. Tunnet merges includes by meaning - not by concatenating text - so overlapping definitions are caught at validate time.

### Example ACL fragment

```hcl
organization_id = "org_01H..."

acl "allow-eng-staging" {
  priority = 100
  action   = "allow"

  src = usergroup("engineering")
  dst = tag("staging")

  ports = ["22", "443", "3000-3010"]
}
```

### Example tests

```hcl
test "engineering can reach staging https" {
  src  = usergroup("engineering")
  dst  = tag("staging")
  port = 443
  want = "allow"
}

test "contractors cannot reach production ssh" {
  src  = usergroup("contractors")
  dst  = tag("production")
  port = 22
  want = "deny"
}
```

## Offline validation and simulation

You can check policy **without** talking to your Tunnet deployment:

| Command | What it does |
| --- | --- |
| `tunnet policy validate` | Schema, references, and conflicts |
| `tunnet policy test` | Runs embedded `test` blocks |
| `tunnet policy simulate` | Returns allow/deny plus which rules matched |
| `tunnet policy fmt` | Formats policy JSON |

```bash
# No credentials required
tunnet policy validate .tunnet
tunnet policy test .tunnet
tunnet policy simulate \
  --file .tunnet \
  --src usergroup:engineering \
  --dst tag:staging \
  --port 443
```

Use simulation in PRs to prove a change does (or does not) open a path before you apply it.

## CLI: remote workflows

Authenticate against Managed Tunnet (cloud or [self-hosted](/self-hosting/)):

```bash
export TUNNET_API_URL=https://management.example.com
export TUNNET_API_KEY=tt_...
```

API keys need `policy:read` for diff / export / simulate against live state, and `policy:apply` for apply and rollback. Machine clients can also use OAuth2 client credentials or OIDC federation from CI (see [Authentication for automation](#authentication-for-automation)).

| Command | Description |
| --- | --- |
| `tunnet policy diff` | Semantic diff vs live org state |
| `tunnet policy apply` | Apply the document (`--force` overwrites drift) |
| `tunnet policy export` | Export live policy (`--remote --format …`) |
| `tunnet policy drift` | Detect dashboard vs Git drift |
| `tunnet policy history` | List policy revisions |
| `tunnet policy rollback` | Restore a prior revision (`--revision-id`) |

```bash
tunnet policy diff .tunnet
tunnet policy apply .tunnet
tunnet policy apply .tunnet --force   # intentional overwrite of dashboard edits
tunnet policy export --remote --format terraform --out ./infra/tunnet
tunnet policy history
tunnet policy rollback --revision-id <revision-id>
```

Full command reference: [tunnet policy](/cli/policy).

## Drift detection and safe apply

Dashboard edits and GitOps applies both update the same live policy and create a new **revision**.

When you apply from Git:

1. Tunnet compares your document to the current live policy.
2. If someone changed policy in the dashboard since your baseline, apply **fails** and reports the drift - unless you pass `--force`.
3. A successful apply creates a new revision and rolls out to agents.

```bash
# Catch dashboard changes before apply
tunnet policy drift .tunnet
```

Default behavior refuses silent overwrite. That is the safe default for production GitOps.

## History and rollback

Every apply (and dashboard change that bumps policy) is recorded as a revision. You can list revisions and roll back to a known-good state from the CLI - without relying only on `git revert` and a re-apply.

```bash
tunnet policy history
tunnet policy rollback --revision-id <revision-id>
```

## Terraform and OpenTofu

The official `terraform-provider-tunnet` manages policy two ways:

| Mode | When to use |
| --- | --- |
| **Granular resources** | Fine-grained ownership - one ACL, group, tag, or SSH rule per resource |
| **Monolithic document** | One `tunnet_policy_document` for Tailscale-style single-file ACLs |

### Provider setup

```hcl
provider "tunnet" {
  api_url         = var.tunnet_api_url
  api_key         = var.tunnet_api_key
  organization_id = var.tunnet_organization_id
  network_id      = var.tunnet_network_id
}
```

Environment variables: `TUNNET_API_URL`, `TUNNET_API_KEY`, `TUNNET_ORGANIZATION_ID`, `TUNNET_NETWORK_ID`. OAuth2 client credentials are also supported for machine runs.

### Granular resources (examples)

- `tunnet_user_group` / `tunnet_device_group`
- `tunnet_tag`
- `tunnet_host_alias` / `tunnet_ip_set`
- `tunnet_acl_rule` / `tunnet_grant`
- `tunnet_ssh_rule` / `tunnet_posture_rule`
- `tunnet_auto_approver`

### Monolithic document

```hcl
resource "tunnet_policy_document" "main" {
  content = file("${path.module}/policy.tunnet.hcl")
}
```

### Export live policy into Terraform

```bash
tunnet policy export --remote --format terraform --out ./infra/tunnet
```

Import existing objects with `terraform import` for every resource type.

## GitOps

Run the same checks in CI that engineers run locally, then apply on merge.

### GitHub Actions

```yaml
- uses: tunnetio/Tunnet/tools/gitops-policy-action@main
  with:
    action: test
    policy-path: .tunnet
    tunnet-api-url: ${{ secrets.TUNNET_API_URL }}
    tunnet-api-key: ${{ secrets.TUNNET_API_KEY }}
    comment-on-pr: true
    simulate-scenarios: |
      [
        { "name": "eng to staging", "src": "usergroup:engineering", "dst": "tag:staging", "port": 443 }
      ]
```

On pull requests, the action validates offline, posts a **semantic** policy diff against live state, and can run traffic simulations. On the default branch, use `action: apply`. Set `force: true` only when you intend to overwrite dashboard drift.

### GitLab CI

```yaml
include:
  - local: tools/ci-templates/gitlab/tunnet-policy.yml

tunnet-policy-test:
  extends: .tunnet-policy-test

tunnet-policy-apply:
  extends: .tunnet-policy-apply
```

### Bitbucket Pipelines

```yaml
- pipe: ./tools/ci-templates/bitbucket/tunnet-policy-pipe.sh
  variables:
    ACTION: test
    POLICY_PATH: .tunnet
    TUNNET_API_URL: $TUNNET_API_URL
    TUNNET_API_KEY: $TUNNET_API_KEY
```

## Authentication for automation

| Method | Best for |
| --- | --- |
| **API key** (`policy:read` / `policy:write` / `policy:apply`) | Simple CI and scripts |
| **OAuth2 client credentials** | Terraform and long-running automation |
| **OIDC federation** | GitHub Actions, GitLab, and Bitbucket without storing long-lived API keys |

Point `TUNNET_API_URL` at Tunnet Cloud or your [self-hosted management server](/self-hosting/management). Policy as Code works the same in both environments.

## Go SDK

Automate policy and related management APIs from Go with the official SDK (`tunnet-go`). Use it for custom tooling, controllers, and the Terraform provider’s own API access - alongside API keys or OAuth2 client credentials.

See the [SDK overview](/sdk/) for embeddable Node and Rust SDKs; the Go package targets the management API rather than embedding a mesh node.

## Recommended workflows

**PR review (no apply)**

```bash
tunnet policy validate .tunnet
tunnet policy test .tunnet
tunnet policy diff .tunnet
```

**Ship on merge**

```bash
tunnet policy apply .tunnet
```

**Recover from a bad change**

```bash
tunnet policy history
tunnet policy rollback --revision-id <revision-id>
```

**Adopt an existing org into Git**

```bash
tunnet policy export --remote --format hcl --out .tunnet
# or
tunnet policy export --remote --format terraform --out ./infra/tunnet
```

## Related docs

- [Access Policies & ACLs](/guide/concepts/access-policies) - how rules apply on agents
- [SSH Policies & Re-Auth](/products/ssh/policies) - SSH-specific rules
- [tunnet policy CLI](/cli/policy) - command reference
- [Self-Hosting: Management Server](/self-hosting/management) - API URL and keys
- [Comparison](/guide/comparison) - full product comparison
