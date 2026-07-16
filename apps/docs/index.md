---
layout: home

hero:
  name: "Tunnet"
  text: "Private mesh networking for your infrastructure"
  tagline: Open-source alternative to Tailscale, ngrok, and Cloudflare mesh. One stack, fully open control plane.
  image:
    src: /logo.png
    alt: Tunnet
  actions:
    - theme: brand
      text: Install Tunnet
      link: /guide/installation
    - theme: alt
      text: View on GitHub
      link: https://github.com/tunnetio/Tunnet

features:
  - icon: 🕸️
    title: Mesh Network
    details: Encrypted P2P connectivity over QUIC (iroh). Every machine gets an internal IP and can reach every other - SSH, ping, curl, anything.
    link: /products/mesh/
  - icon: 🔌
    title: Serve
    details: Expose local services to your mesh with internal TLS from your org's CA. ACL-protected, hostname-addressable. Like an internal load balancer.
    link: /products/serve/
  - icon: 🌐
    title: Tunnel
    details: Give any local port a public HTTPS URL through a relay - webhooks, demos, or permanent endpoints without touching firewall rules.
    link: /products/tunnel/
  - icon: 📁
    title: Send
    details: Transfer files peer-to-peer over the mesh. BLAKE3-verified, consent-based, with multicast to tagged machines.
    link: /products/send/
  - icon: 🔑
    title: SSH
    details: Identity-based SSH with no keys to distribute. Session recording, re-auth policies, and full audit trails in the dashboard.
    link: /products/ssh/
  - icon: 🏗️
    title: Self-Hosted Relay
    details: Run your own edge relay for public tunnels. ACME support, bring your own certs, full control over your tunnel infrastructure.
    link: /products/relay/
---

<InstallPicker />
