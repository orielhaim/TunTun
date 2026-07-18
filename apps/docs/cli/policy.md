# tunnet policy

Manage Tunnet **access policy as code** from the CLI: validate and test offline, then diff, apply, export, detect drift, and roll back against Managed Tunnet.

::: tip Direct mode
For Direct (P2P) coordinator firewall rules, use [`tunnet coordinator-policy`](/cli/direct#tunnet-coordinator-policy). That is separate from Managed Policy as Code.
:::

## Authentication

Remote commands need a management API endpoint and credentials:

```bash
export TUNNET_API_URL=https://management.example.com
export TUNNET_API_KEY=tt_...
```

| Scope | Commands |
| --- | --- |
| `policy:read` | `diff`, `export`, `drift`, `history`, live `simulate` |
| `policy:apply` | `apply`, `rollback` |

Offline commands (`validate`, `test`, local `simulate`, `fmt`) need no credentials.

You can also authenticate with OAuth2 client credentials or OIDC federation from CI. See [Policy as Code → Authentication](/guide/policy-as-code#authentication-for-automation).

## Commands

| Command | Offline | Description |
| --- | --- | --- |
| `tunnet policy validate <path>` | Yes | Schema, references, and conflicts |
| `tunnet policy test <path>` | Yes | Run embedded `test` blocks |
| `tunnet policy simulate --file <path> --src … --dst …` | Yes* | Traffic verdict and matching rules |
| `tunnet policy fmt <path>` | Yes | Format policy JSON |
| `tunnet policy diff <path>` | No | Semantic diff vs live state |
| `tunnet policy apply <path>` | No | Apply document (`--force` overwrites drift) |
| `tunnet policy export --remote` | No | Export live policy (`--format hcl\|json\|yaml\|terraform`) |
| `tunnet policy drift <path>` | No | Detect dashboard vs document drift |
| `tunnet policy history` | No | List policy revisions |
| `tunnet policy rollback --revision-id <id>` | No | Restore a prior revision |

\* Local simulation uses only the document on disk. Pointing at live state for simulation requires `policy:read`.

## Examples

```bash
# Before opening a PR
tunnet policy validate .tunnet
tunnet policy test .tunnet
tunnet policy simulate \
  --file .tunnet \
  --src usergroup:engineering \
  --dst tag:staging \
  --port 443

# Against production
tunnet policy diff .tunnet
tunnet policy apply .tunnet
tunnet policy apply .tunnet --force

# Export and recover
tunnet policy export --remote --format hcl --out .tunnet
tunnet policy export --remote --format terraform --out ./infra/tunnet
tunnet policy history
tunnet policy rollback --revision-id <revision-id>
```

## Formats

Pass a file or a directory (multi-file `.tunnet/` tree with `include` blocks). Supported formats: **HCL**, **JSON**, and **YAML**.

## See also

- [Policy as Code guide](/guide/policy-as-code)
- [Access Policies & ACLs](/guide/concepts/access-policies)
