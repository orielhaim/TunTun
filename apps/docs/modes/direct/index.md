# Direct Mode

Direct mode creates a P2P mesh network with no control plane, no server, and no infrastructure. It is a fully decentralized alternative where peers coordinate through CRDTs and discover each other via the Mainline DHT.

## When to use Direct mode

Use direct mode when you want to connect a few machines with zero infrastructure, when you cannot or do not want to run servers, for temporary or ephemeral connections, or for personal use where SSO and dashboards are unnecessary.

## How it works

Direct mode stores network membership in an [iroh-docs](https://github.com/n0-computer/iroh-docs) document - a CRDT that replicates across all peers. When a new peer joins, it writes its entry to the document, and the entry propagates to all other peers automatically.

Peer discovery uses the Mainline DHT. A topic is derived from the network name and secret. Peers publish their iroh endpoint IDs to this topic and discover each other.

Transport authentication uses a pre-shared key (PSK). Before accepting any application-level connection, peers perform a PSK handshake to prove they know the network secret. This prevents unauthorized machines from communicating even if they discover the peer addresses.

## Commands

```bash
# Create a network (become coordinator)
sudo tuntun create --name my-net --secret "passphrase"

# Generate an invite code
tuntun invite --name my-net

# Join with an invite code
sudo tuntun join <INVITE_CODE>

# Ephemeral 2-peer connection
tuntun connect --name session --secret "shared"

# Manage join requests (coordinator)
tuntun requests
tuntun accept <endpoint_id>
tuntun deny <endpoint_id>

# Kick a peer
tuntun kick <endpoint_id>

# Manage firewall
tuntun firewall list
tuntun firewall add --src <cidr> --dst <cidr> --action allow
tuntun firewall remove <rule_id>
```

## Direct mode firewall

Direct mode includes a local firewall engine. Since there is no central policy server, each peer manages its own firewall rules. Default rules are created automatically. You can add custom rules to restrict traffic between specific CIDRs.

## Limitations

Direct mode does not include a web dashboard, SSO/OIDC, centralized access policies, public tunnels, relay infrastructure, or API key management. For these features, upgrade to managed mode.
