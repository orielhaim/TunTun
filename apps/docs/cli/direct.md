# Direct Mode Commands

These commands manage Direct (P2P) networks that operate without a control plane.

## tuntun create

Create a new Direct network and become the coordinator.

```bash
sudo tuntun create --name <name> --secret <passphrase>
```

## tuntun join

Join an existing Direct network with an invite code.

```bash
sudo tuntun join <INVITE_CODE>
```

## tuntun invite

Generate an invite code for others to join your Direct network.

```bash
tuntun invite --name <network_name>
```

## tuntun connect

Establish an ephemeral two-peer connection.

```bash
tuntun connect --name <name> --secret <shared_secret>
```

Both machines must use the same name and secret.

## tuntun requests / accept / deny

Manage pending join requests (coordinator only).

```bash
tuntun requests
tuntun accept <endpoint_id>
tuntun deny <endpoint_id>
```

## tuntun kick

Remove a peer from the network.

```bash
tuntun kick <endpoint_id>
```

## tuntun firewall

Manage local firewall rules for Direct mode.

```bash
tuntun firewall list
tuntun firewall add --src <cidr> --dst <cidr> --action allow
tuntun firewall remove <rule_id>
```

## tuntun upgrade-to-managed

Migrate from Direct to Managed mode.

```bash
tuntun upgrade-to-managed \
  --control-url http://control:8080 \
  --token TOKEN
```
