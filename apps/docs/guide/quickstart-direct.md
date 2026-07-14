# Quick Start - Direct Mode

Direct mode creates a peer-to-peer mesh network with **no control plane, no server, no infrastructure**. Membership is stored in a CRDT document (iroh-docs), peer discovery uses the Mainline DHT, and transport auth proves knowledge of a pre-shared key.

This mode is ideal for individuals, small groups, or situations where you cannot or do not want to run any servers.

## 1. Create a network

On the first machine:

```bash
sudo tuntun create --name my-network --secret "a-strong-passphrase"
sudo tuntun run
```

The machine creates a new Direct network and becomes its coordinator.

## 2. Generate an invite

```bash
tuntun invite --name my-network
```

This outputs an invite code that encodes the iroh-docs document ID, a network topic, and the pre-shared key.

## 3. Join from another machine

```bash
sudo tuntun join <INVITE_CODE>
sudo tuntun run
```

The new peer connects via the DHT, proves it knows the PSK, and joins the membership document. Both machines get mesh IPs and can communicate.

## 4. Verify

```bash
tuntun status --peers
tuntun ping other-machine
```

## Managing Direct networks

Direct mode supports several management commands. `tuntun requests` lists pending join requests if you are the coordinator. `tuntun accept` and `tuntun deny` handle those requests. `tuntun kick` removes a peer. `tuntun firewall` manages the local firewall rules.

## Ephemeral two-peer connections

For the simplest possible case - connecting exactly two machines - use:

```bash
# Machine A
tuntun connect --name session1 --secret "shared-secret"

# Machine B
tuntun connect --name session1 --secret "shared-secret"
```

Both machines discover each other via the DHT and establish a direct connection.

## Upgrading to Managed

When you outgrow Direct mode and need a dashboard, SSO, or centralized policies:

```bash
tuntun upgrade-to-managed \
  --control-url http://your-control-host:8080 \
  --token YOUR_ENROLLMENT_TOKEN
```

This migrates your network to managed mode without losing connectivity.
