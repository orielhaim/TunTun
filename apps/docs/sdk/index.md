# SDK

Tunnet offers two kinds of SDKs:

1. **Embeddable mesh nodes** - run Tunnet inside your app process (streams, files, mesh traffic).
2. **Management API (Go)** - automate organizations, policy, and related APIs from controllers and tooling.

## Embeddable mesh SDKs

| SDK | Package | Language |
|-----|---------|----------|
| [Node.js / Bun](/sdk/js/) | `@tunnet/sdk` | TypeScript / JavaScript |
| [Rust](/sdk/rust/) | [`tunnet`](https://crates.io/crates/tunnet) | Rust |

Pick the SDK that matches your runtime. Both talk to the same Tunnet networks and peers.

## Go management SDK

The official Go SDK (`tunnet-go`) talks to the Tunnet management API. Use it for custom automation, controllers, and alongside the Terraform provider.

Authenticate with an API key or OAuth2 client credentials. Typical uses:

- Apply or export policy documents
- Manage groups, tags, ACL rules, and related objects
- Build internal platforms on top of Tunnet

Policy workflows (CLI, Terraform, GitOps) are covered in [Policy as Code](/guide/policy-as-code).
