# tunnet login / logout

Authenticate the CLI with the management API using OAuth device authorization (RFC 8628).

## Login

```bash
tunnet login --management-url http://localhost:3000
```

This initiates a device authorization flow. The CLI displays a code and opens a browser to the authorization page (**Settings → Account → Authorize CLI**). Enter the code to link the CLI to your account.

## Logout

```bash
tunnet logout
```

Clears stored management tokens from the local state.
