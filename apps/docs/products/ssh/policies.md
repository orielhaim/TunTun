# SSH Policies & Re-Auth

SSH policies provide fine-grained control over who can SSH to which machines and under what conditions.

## Check mode (re-authentication)

When an SSH policy requires check mode, the user must re-authenticate through a browser flow before the SSH session is established. Running `tunnet ssh` (or connecting with stock OpenSSH after policy check is required) opens a browser window to the Tunnet SSO confirmation page (`/auth/ssh`). Once confirmed, the session proceeds.

This is useful for sensitive machines where you want to ensure the user has recently verified their identity, even if they have a valid session.

## Policy configuration

SSH policies are configured under **Networks → Access → SSH Rules** in the dashboard. Each rule can specify source tags or machines, destination tags or machines, whether recording is required, and whether check-mode re-auth is enforced.
