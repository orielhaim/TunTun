# Encryption & QUIC

TunTun does not use WireGuard. All mesh traffic is encrypted using QUIC, powered by the [iroh](https://iroh.computer) networking library.

## Why QUIC instead of WireGuard?

WireGuard is excellent for point-to-point VPN tunnels, but mesh networking on top of it requires workarounds: userspace implementations for NAT traversal, separate relay protocols, and no native support for multiplexed streams.

iroh provides QUIC connections with built-in NAT traversal (STUN, relay fallback), multiplexed bidirectional streams (used for serve, tunnel, SSH, and file transfer), and datagram support (used for mesh packet forwarding). The encryption is TLS 1.3 under the hood.

## Connection establishment

When peer A wants to reach peer B, the iroh endpoint uses the peer's endpoint ID (derived from its Ed25519 public key) to establish a QUIC connection. iroh tries direct connectivity first (via known addresses and STUN), then falls back to relay-assisted connectivity if a direct path cannot be established.

## ALPN protocol negotiation

TunTun uses QUIC ALPN (Application-Layer Protocol Negotiation) to multiplex different protocols over the same iroh endpoint. Each protocol has its own ALPN identifier: `tuntun/tunnel/1` for mesh datagrams, `tuntun/relay/1` for relay reverse tunnels, `tuntun/ssh/1` for SSH sessions, `tuntun/send/1` for file transfers, and `tuntun/recording/1` for SSH session recordings.

## Direct mode transport auth

In direct mode (no control plane), peers additionally perform a PSK handshake before accepting any application-level ALPN. This ensures that only peers who know the network secret can communicate, even without a central authority.
