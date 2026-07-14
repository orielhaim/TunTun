# Internal TLS & CA

Every organization in TunTun has an internal Certificate Authority. When you create a serve, the control plane issues a TLS certificate signed by this CA. Peers trust the CA root because it is distributed in the network snapshot.

## How it works

The CA keypair is generated when the organization is created and stored in the database. When a serve is registered, the control plane generates a certificate for the serve's internal hostname (e.g., `my-service.tuntun`) signed by the CA. The agent uses this certificate to terminate TLS for incoming connections from peers.

Peers receive the CA root certificate in the `org_ca_pem` field of the endpoint snapshot and add it to their trust store when connecting to serves.

## Viewing the CA

The CA root certificate is visible in the dashboard under **Settings → Internal CA**.
