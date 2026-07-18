# Terraform Provider for Tunnet

Official Terraform provider for managing Tunnet policy and network resources.

## Requirements

- Terraform 1.0+
- Tunnet API key with management scopes

## Provider configuration

```hcl
provider "tunnet" {
  api_url         = var.tunnet_api_url
  api_key         = var.tunnet_api_key
  organization_id = var.tunnet_organization_id
  network_id      = var.tunnet_network_id
}
```

Environment variables: `TUNNET_API_URL`, `TUNNET_API_KEY`, `TUNNET_ORGANIZATION_ID`, `TUNNET_NETWORK_ID`.

## Development

```bash
go work sync
go build ./...
```
