# TunTun Architecture Document: Transparent IP Network with iroh + TUN

## Comprehensive Technical Research and Planning Document

---

## 1. Executive Summary

The product is a SaaS service that creates virtual IP networks between distributed devices. The user installs an agent on each device, receives an internal IP address (e.g. 10.7.0.x), and any regular application — SSH, curl, browser — works completely transparently, without the user knowing that the traffic is passing through an encrypted tunnel.

The architecture is built on two cornerstones: **iroh** for the communication layer (QUIC + NAT traversal + relay) and **tun-rs** for the virtual network interface layer (TUN device).

---

## 2. Technology Selection — In-Depth Analysis

### 2.1 iroh — P2P Communication Library

**Source:** <https://github.com/n0-computer/iroh>
**License:** MIT / Apache 2.0
**Developer:** n0, Inc.
**Language:** Rust

iroh is a library for creating direct connections between endpoints. The core API is dialing over a public key — you say "connect to this device," and iroh finds and maintains the fastest route, regardless of physical location.

**What iroh includes:**

iroh is built on **noq** (their own QUIC implementation, a fork of Quinn). It provides: encrypted QUIC connections (TLS 1.3) with end-to-end encryption, built-in NAT traversal (hole-punching) that succeeds in about 90% of network configurations, a system of relay servers as a fallback when a direct connection fails, peer discovery via DNS and Pkarr, support for QUIC multipath (relay and direct paths as QUIC-level paths), and QUIC datagrams (RFC 9221) for unreliable traffic.

**NAT Traversal Architecture:**

According to the official documentation, the process works like this: The two peers first connect to a common relay server. Through the relay, they exchange information — public IP addresses, port numbers, and local addresses. The two peers simultaneously send UDP datagrams to each other's public addresses (simultaneous outbound connection). Firewalls recognize the packets as a response to outgoing traffic and allow them. If all else fails, iroh automatically falls back to relay.

iroh states in its documentation that its NAT traversal is **deterministic**: if it works once between two devices, it will continue to work as long as the network configuration does not change.

**noq — QUIC implementation:**

**Source:** <https://github.com/n0-computer/noq>

noq (number 0 QUIC) started as a fork of Quinn and eventually became an independent hard fork. The main changes from Quinn are: full implementation of QUIC Multipath (draft-ietf-quic-multipath), support for QUIC Address Discovery (QAD, draft-ietf-quic-address-discovery), implementation of QUIC NAT Traversal (draft-seemann-quic-nat-traversal), and support for RFC 9221 (Unreliable Datagrams).

noq is already in production as part of iroh v0.96 and above, and has been interop tested against picoquic.

The APIs that are relevant to us include `Connection::send_datagram()` and `Connection::read_datagram()` for sending and receiving datagrams without retransmission, `Connection::open_bi()` and `Connection::open_uni()` for sending reliable data over streams, and `Path` and `PathId` for managing QUIC multipath.

**noq's UDP layer:**

noq uses `noq-udp` (a fork of `quinn-udp`) which supports UDP GSO, UDP GRO, and `sendmmsg()`/`recvmmsg()` on Linux. This is critical for performance — see the Performance section.

### 2.2 tun-rs — TUN/TAP Interface

**Source:** <https://github.com/tun-rs/tun-rs>
**License:** Apache 2.0
**Current version:** 2.x
**Crate:** `tun-rs`

tun-rs is a cross-platform library for creating and managing TUN (layer 3) and TAP (layer 2) interfaces. It is described as "production-ready" and reports impressive benchmarks.

**Supported platforms:**

Linux (with full offload + multi-queue), Windows (via wintun.dll to TUN, tap-windows to TAP), macOS (utunN to TUN, feth to TAP), FreeBSD/OpenBSD/NetBSD (full support), Android (via VpnService API), iOS/tvOS (via NEPacketTunnelProvider), and OpenHarmony.

**Key Features:**

TSO/GSO offload on Linux for 3-4x throughput, multi-queue on Linux for parallel processing, synchronous and asynchronous APIs (tokio and async-io), support for multiple IPv4 and IPv6 on a single interface, and `recv_multiple()`/`send_multiple()` for batch processing.

**Official Benchmarks (from tun-rs README):**

| Configuration | Throughput | CPU | Memory |
|---|---|---|---|
| Sync + Offload + Concurrent | **70.6 Gbps** | 124% | 10.6 MB |
| Async + Offload | **35.7 Gbps** | 64.9% | 7.4 MB |
| Async + Offload + BytesPool | **31.4 Gbps** | 93.0% | 16.0 MB |
| Async (no offload) | **8.84 Gbps** | 87.6% | 3.7 MB |

These benchmarks show that offload is the difference between 8.84 Gbps and 35+ Gbps — a 4x improvement. This is exactly in line with Tailscale's findings.

**Key point:** These benchmarks measure only the TUN device (read/write), not a complete tunnel with encryption. In a real tunnel, the bottleneck is the I/O to the TUN and the per-packet cost of system calls, not the encryption itself — which is why offloads are so critical.

### 2.3 Supplementary protocols from iroh ecosystem

**iroh-gossip** (<https://crates.io/crates/iroh-gossip>) — An implementation of epidemic broadcast trees (based on HyParView + Plumtree) for pub/sub. Relevant for us to distribute routing updates between agents. Instead of a central WebSocket, we can use gossip to let agents update each other about network changes.

**iroh-blobs** — BLAKE3-based content-addressed file transfer. Not directly relevant to tunneling but useful if we want to distribute agent or configuration updates.

---

## 3. System Architecture

### 3.1 Data Flow — End to End

```
[Normal Application]
→ [kernel networking stack]
→ [TUN device: 10.7.0.x]
→ [Agent: Read packet from TUN]
→ [IP header parser, lookup destination → peer EndpointId]
→ [iroh/noq: conn.send_datagram()] — QUIC datagram, unreliable
→ [AES-256-GCM encryption (AES-NI accelerated)]
→ [noq-udp: sendmmsg() + UDP GSO]
→ [NIC → Wire → NIC]
→ [noq-udp: recvmmsg() + UDP GRO]
→ [AES-256-GCM decryption]
→ [Agent: Write packet to TUN]
→ [TUN device → kernel → application]
```

### 3.2 Layer 1 — The Agent

The Agent is a daemon that runs on each device on the network. It does three things:

**Create a TUN device and assign an IP:**

```rust
use tun_rs::DeviceBuilder;

let tun = DeviceBuilder::new()
.name("mynet0")
.ipv4("10.7.0.5", 24, None) // IP assigned by control plane
.mtu(1280) // Reduced MTU for QUIC overhead
.offload(true) // TSO/GRO — performance critical
.build_sync()?; // sync because we want thread control
```

**Creating iroh endpoint:**

```rust
use iroh::Endpoint;
use iroh::endpoint::presets;

let endpoint = Endpoint::builder(presets::N0) // or preset matched with your relay
.alpns(vec![b"mynet/tunnel/1".to_vec()])
.bind()
.await?;

let my_endpoint_id = endpoint.id();
// ← Sending this to the control plane at runtime Registration
```

**Important Note:** In iroh 0.94+, the names have changed — `NodeId` has become `EndpointId`, `node_id` has become `endpoint_id`, `NodeAddr` has become `EndpointAddr`. The builder supports a new Presets API that allows you to define ready-made configurations.

**Outbound Loop — TUN → iroh (with offload):**

```rust
# [cfg(target_os = "linux")]

{
use tun_rs::{VIRTIO_NET_HDR_LEN, IDEAL_BATCH_SIZE};

let mut original_buffer = vec![0; VIRTIO_NET_HDR_LEN + 65535];
let mut bufs = vec![vec![0u8; 1500]; IDEAL_BATCH_SIZE];
let mut sizes = vec![0; IDEAL_BATCH_SIZE];

loop {
 // Batch reading of packets — one syscall for dozens of packets
let num_packets = tun.recv_multiple(
&mut original_buffer,
&mut bufs,
&mut sizes,
0
)?;

for i in 0..num_packets {
let packet = &bufs[i][..sizes[i]];
let dest_ip = parse_ipv4_dest(packet);

if let Some(peer_id) = routing_table.lookup(dest_ip) {
let conn = connection_pool.get_or_connect(peer_id).await?;
// QUIC datagram — unreliable, without retransmit
conn.send_datagram(Bytes::copy_from_slice(packet))?;
}
}
}
}

```

**Inbound loop — iroh → TUN:**

```rust
loop { 
let incoming = endpoint.accept().await?; 
let conn = incoming.await?; 

tokio::spawn(async move { 
loop { 
match conn.read_datagram().await { 
Ok(packet) => { 
// Injection to TUN — the OS sees a normal packet 
tun.send(&packet)?; 
} 
Err(_) => break,
 } 
} 
});
}
```

### 3.3 Layer 2 — Control Plane (SaaS)

Central server that manages:

**Device registration:** Each agent that comes up registers with its `EndpointId`. The control plane assigns an IP from the network pool (10.7.0.0/24), and returns the routing table — IP → EndpointId mapping.

**Distributing routing updates:** When a device joins or leaves, all agents need to be updated. Two options: Central WebSocket (simple, suitable for starting), or `iroh-gossip` as a distributed pub/sub (suitable for scale).

**Authentication and identities:** SSO, API keys, team management, ACLs (who is allowed to communicate with whom).

**Relay management:** Relay server health monitoring, regional routing.

### 3.4 Layer 3 — Relay Servers

iroh provides the relay as a binary and a library. Each relay is **stateless** — it does not store application data, it only mediates connections. Which means: no database synchronization between relay instances, no state migration, simple scaling (add/drop instances), and automatic failover.

**Numbers from the official documentation:** Each relay handles up to 60,000 concurrent connections. For a production environment, at least two relays in different geographical regions are recommended. Traffic is encrypted E2E — the relay cannot read content, but it sees endpoint IDs and a list of connections.

**Self-hosted relay:**

```bash
# Running relay with automatic TLS via ACME
iroh-relay --hostname relay.yourdomain.com
```

**Managed relays (Iroh Services):**

```rust
let preset = iroh_services::preset()
.relays(["https://relay-us.yourdomain.com", "https://relay-eu.yourdomain.com"])?
.api_secret_from_str("YOUR_API_KEY")?
.build()?;

let endpoint = Endpoint::bind(preset).await?;
```

Managed relays require authentication by default — the endpoint presents a signed token derived from the API key, and does not send the key itself.

---

## 4. In-depth performance analysis

### 4.1 The Base — Real Numbers from Documented Benchmarks

**WireGuard kernel module:** 5.4 Gbps QUIC throughput on bare metal (i5-12400 + 25GbE NIC) as benchmarked by Tailscale with secnetperf.

**wireguard-go (before Tailscale optimizations):** 2.9 Gbps QUIC throughput on the same hardware.

**wireguard-go (after all Tailscale optimizations):** 12.4 Gbps QUIC throughput on the same hardware. **That's 2.3x faster than a kernel module.**

**boringtun (Cloudflare, Rust):** Performance not documented at the same level of detail. Cloudflare stated at the time that it was faster than wireguard-go but slower than a kernel module — but that was before Tailscale optimizations (TSO/GRO/GSO).

### 4.2 Why userspace is "slow" — the real problem

Tailscale published three detailed blog posts that prove the critical point: **The problem was never encryption. The problem is system calls and per-packet cost.**

Every packet that goes through VPN userspace does: App → kernel → TUN device → `read()` syscall → userspace (encryption) → `sendmsg()` syscall → kernel → UDP socket → NIC.

With an MTU of 1500 and a throughput of 10 Gbps, you need to process ~830,000 packets/sec. Each `read()` and `sendmsg()` are expensive system calls. Tailscale showed in their flame graphs that more CPU time is spent sending UDP packets than encrypting them.

### 4.3 Tailscale Optimizations — Just What We Need

**Post 1 (Tailscale v1.36) — "Userspace isn't slow, some kernel interfaces are!":**

Enabled TSO and GRO on the TUN driver. Instead of reading one 1500-byte packet per syscall, the TUN driver combines dozens of packets into a "super packet" of up to 64KB. Up to 44x reduction in syscalls. This feature has been in the Linux kernel since v2.6.27 (2008!) but almost no one has used it outside of virtio. In addition, `sendmmsg()`/`recvmmsg()` — sending/receiving multiple messages in a single syscall — has been enabled. The result: a 2.2x improvement in wireguard-go throughput. wireguard-go (userspace) beats the WireGuard kernel module.

**Post 2 (Tailscale v1.40) — "Surpassing 10Gb/s":**

UDP GSO (Generic Segmentation Offload) has been enabled — the kernel delays segmentation of batches of UDP datagrams, reducing traversals through the networking stack. Support for Linux v4.18+. Enabled UDP GRO (Generic Receive Offload) — the other side, coalescing of incoming UDP packets. Support for Linux v5.0+. Loop unwinding was performed in checksum computation which reduced the runtime of the function by 57%. Result: Tailscale joined the 10Gb/s club. wireguard-go on bare metal i5-12400 reached 10+ Gbps TCP throughput.

**Post 3 (Tailscale v1.54) — "QUIC/UDP throughput":**

Enabled TUN UDP GSO/GRO — In Linux v6.2, segmentation offload support was added also for UDP (and not just TCP) at the TUN driver level. Result: **4x improvement in UDP throughput.** wireguard-go reached **12.4 Gbps QUIC throughput** on i5-12400 — **2.3x more than kernel WireGuard** (5.4 Gbps).

The C-state discovery was interesting in itself: Tailscale found that with TUN UDP GSO/GRO, the CPU was working so efficiently that it went into deep sleep states (C6, C8, C10) between packets, and the wakeup latency was killing the throughput. With `max_cstate=9` they got 1.3 Gbps; with `max_cstate=1` they jumped to 10.7 Gbps. This is important to document for customers running relay/forwarding nodes.

### 4.4 What this means for us — Performance Strategy

**Key point:** The dominant bottleneck — TUN I/O + syscalls — is the same between WireGuard userspace and iroh. The optimizations that made the difference (TSO/GRO/GSO/mmsg) are also available to us. Therefore, we do not sacrifice performance by choosing iroh.

**Optimization 1 — QUIC Datagrams (not Streams) — Mandatory from day 1:**

IP packets must be passed as QUIC datagrams (RFC 9221), not as QUIC streams. Reason: streams are reliable (retransmit). If you send TCP-over-reliable-QUIC-stream, you get **TCP meltdown** — two competing retransmit layers. This is a classic documented problem. QUIC datagrams are unreliable (like UDP), just like WireGuard works over UDP.

noq supports RFC 9221. The API:

```rust
// send
conn.send_datagram(packet_bytes)?; // unreliable, no retransmit

// receive
let packet = conn.read_datagram().await?;
```

**Optimization 2 — TUN offload (TSO/GRO) — Expected 3-4x improvement:**

tun-rs supports offload from Linux. Their benchmarks show an improvement from 8.84 Gbps to 35.7 Gbps (4x) with offload.

```rust
let tun = DeviceBuilder::new()
.offload(true) // critical!
.ipv4("10.0.0.1", 24, None)
.mtu(1280)
.build_sync()?;

// Batch reading
let num = tun.recv_multiple(&mut original_buffer, &mut bufs, &mut sizes, 0)?;
```

**Optimization 3 — UDP GSO/GRO in noq:**

noq (a fork of Quinn) uses `noq-udp` which supports GSO/GRO. According to research on quinn-udp, the library prefers GSO over sendmmsg and uses recvmmsg for receiving. This should already be enabled by default.

**Optimization 4 — Multi-queue TUN:**

```rust
let tun = DeviceBuilder::new()
.offload(true)
.multi_queue(true)
.ipv4("10.0.0.1", 24, None)
.build_sync()?;

// Thread per queue
let tun_clone = tun.try_clone()?;
std::thread::spawn(move || {
loop {
let num = tun_clone.recv_multiple(...)?;
// process + encrypt + send
}
});
```

**Optimization 5 — C-state management:**

On relay/forwarding servers: `max_cstate=1` in kernel parameter. It is important to document this.

### 4.5 Encryption — AES-GCM vs ChaCha20

WireGuard uses ChaCha20-Poly1305. QUIC/TLS 1.3 uses (usually) AES-256-GCM.

On modern CPUs with AES-NI (almost every x86 from 2010, every ARM with ARMv8): AES-GCM is hardware accelerated and reaches 10+ GB/s (bytes, not bits) on a single core. ChaCha20 reaches 3-5 GB/s per core.

On CPU **without** AES-NI (old IoT devices, old ARM): ChaCha20 is faster because it is designed for good performance in software only.

**Conclusion:** On modern hardware, QUIC/TLS 1.3 AES-GCM is just as fast (and usually faster) than WireGuard's ChaCha20.

noq uses rustls with ring or aws-lc-rs — both support AES-NI acceleration.

### 4.6 Performance Prediction

| Metrics | WireGuard kernel | wireguard-go (Tailscale) | iroh + optimizations (estimate) |
|---|---|---|---|
| TCP throughput (25GbE bare metal) | ~8 Gbps | ~10-12 Gbps | ~6-10 Gbps |
| QUIC/UDP throughput (25GbE bare metal) | ~5.4 Gbps | ~12.4 Gbps | ~5-10 Gbps |
| Latency overhead | ~0.1ms | ~0.2ms | ~0.3-0.5ms |
| NAT traversal | None | Built-in (DERP/STUN) | Built-in (relay/QUIC NAT) |

The additional overhead of iroh over wireguard-go comes from: QUIC state machine is more complex (more bookkeeping), TLS 1.3 initial handshake is more complex than Noise Protocol (but it's one-time), and the fact that Tailscale optimizations have been developed and polished for years. The steady-state throughput should be close, because the dominant bottleneck (TUN I/O + syscalls) is the same.

---

## 5. Technical Challenges and Solutions

### 5.1 MTU and Fragmentation

Normal IP packets are up to 1500 bytes. When wrapping in QUIC, there is an overhead of ~40-60 bytes (QUIC header + UDP header + IP header). You need to set a lower TUN MTU — **1280 is safe** (this is the minimum for IPv6 according to RFC). That way, packets that enter TUN are already of a suitable size without fragmentation.

### 5.2 Connection pool

You need a pool of QUIC connections — one connection per peer. Lazy connect (connect only when there is traffic), idle timeout (close inactive connection), and reconnect logic.

**QUIC multipath of noq** means that even when the network path changes (e.g. WiFi to cellular), the connection is not broken — the QUIC layer manages the transitions.

### 5.3 Routing table

Initially `HashMap<Ipv4Addr, EndpointId>` is enough. In the future, if we want subnet routing (sending an entire subnet through a specific peer), we will need a trie with longest prefix match.

### 5.4 Cross-platform

tun-rs covers the main platforms. Each platform requires special permissions: Linux needs root or CAP_NET_ADMIN, Windows needs Administrator, macOS needs root, on iOS you need to use NEPacketTunnelProvider and get fd, on Android you need VpnService.Builder.establish() which gives fd.

**Important point for iOS:** As of iOS 16, the KVO method for getting a file descriptor is deprecated. You need to use the utun socket search method (documented in the tun-rs README with a full Swift example).

### 5.5 TCP Meltdown — Why datagrams and not streams

When a TCP application sends traffic over a reliable QUIC stream, a double layer of reliability is achieved: the application's TCP retransmits, and the QUIC stream also retransmits. When there is packet loss, both layers react — TCP lowers the window and increases the timeout, and at the same time QUIC retransmits. This creates a vicious cycle that causes throughput to crash. This is a classic problem called TCP meltdown, well documented also in the context of OpenVPN over TCP.

The solution: QUIC datagrams (RFC 9221) are unreliable — just like UDP. The application (its TCP/UDP) is responsible for reliability at its own level. The tunnel only transfers the packets.

---

## 6. Comparison: iroh + TUN vs WireGuard/boringtun

### 6.1 What iroh provides that is difficult to build on your own

**NAT traversal:** iroh provides built-in hole-punching that works ~90% of the time, with automatic fallback to the relay. Building NAT traversal from scratch is a multi-month project — STUN, TURN, ICE, handling different NAT types (symmetric, cone), retry logic, and more.

**Relay infrastructure:** Stateless, open source relay servers, with automatic TLS. Each relay handles 60K connections. Self-hosted or managed possible. The relay protocol is E2E encrypted — the relay cannot read traffic.

**Peer discovery:** DNS + Pkarr are built-in. Endpoint advertises its addresses, and peers find it by EndpointId.

**QUIC multipath:** noq manages multiple network paths (relay, direct IPv4, direct IPv6) as first-class QUIC paths. This means that when one path breaks, the connection continues on another path **without interruption**.

### 6.2 What WireGuard/boringtun gives that iroh doesn't

**Built-in TUN integration:** WireGuard was designed from the ground up for IP tunneling. It can read from and write to TUN. With iroh, we build the TUN layer ourselves.

**Dedicated encryption protocol:** WireGuard's Noise Protocol Framework is very fast and simple — 1-RTT handshake, minimal state. QUIC's TLS 1.3 is more complex (though provides more flexibility, such as certificate rotation).

**Smooth tunneling performance:** Tailscale has invested years in wireguard-go tunnel-specific optimizations. We'll have to do similar work.

### 6.3 Comparison table

| Aspect | iroh + TUN | WireGuard/boringtun |
|---|---|---|
| NAT traversal | Built-in, ~90% success | Need to build from scratch |
| Relay fallback | Built-in, stateless, E2E encrypted | Need to build (TURN/DERP) |
| Peer discovery | Built-in DNS + Pkarr | Need to build |
| QUIC multipath | Built-in, transparent path failover | None |
| Encryption protocol | QUIC/TLS 1.3 (AES-GCM w/ AES-NI) | WireGuard/Noise (ChaCha20) |
| TUN integration | Need to build (tun-rs) | Built-in |
| Tunnel performance (optimized) | ~5-10 Gbps (estimate) | ~12.4 Gbps (proven) |
| Cross-platform | Rust, FFI bindings | Go/Rust, based |
| Total development complexity | Medium (NAT traversal ready) | High (NAT traversal from zero) |
| Maturity | production, 200K+ devices | production, millions |

---

## 7. Control Plane Design

### 7.1 Registration and Authentication

Agent comes up → connects to the control plane (HTTPS) → authenticates (API key / SSO token) → sends its EndpointId → receives back: assigned IP (10.7.0.X), complete routing table (IP → EndpointId for all peers in its network), and relay servers configuration.

### 7.2 Routing updates

**Option A — Central WebSocket:**

Each agent holds a WebSocket to the control plane. When a device joins/leaves, the control plane sends an update to all agents in the relevant network. Simple, suitable for MVP.

**Option B — iroh-gossip:**

Agents join a gossip topic in the iroh network. Routing changes are propagated peer-to-peer without dependence on a central server. Suitable for scale — iroh-gossip tested with 2000 nodes.

### 7.3 ACLs and Policy

The control plane defines who is allowed to communicate with whom. The agent enforces: if it receives a packet to a destination it is not allowed to send to — it is dropped. And if it receives a connection from a peer that is not in its network — it rejects.

---

## 8. Development Plan — Steps

### Step 1 — Working POC

Building: Basic agent with tun-rs + iroh. Connecting two devices. Sending IP packets as QUIC datagrams. Verifying that ping, SSH, curl work.

Highlights: QUIC datagrams from day 1 (not streams!). MTU 1280. Basic connection pool.

### Step 2 — Basic control plane

Agent registration, IP assignment, routing distribution. Basic authentication (API keys). Dashboard.

### Step 3 — Performance optimizations

TUN offload (TSO/GRO) — Expected 3-4x improvement. UDP GSO/GRO (ensure it is enabled in noq). Multi-queue + multi-thread. Measurement after each step.

### Step 4 — Cross-platform

Windows agent (tun-rs + wintun.dll). macOS agent. Android app (VpnService). iOS app (NEPacketTunnelProvider).

### Step 5 — Production hardening

Self-hosted relay servers in different regions. Monitoring and metrics. ACLs and policy engine. Subnet routing.

---

## 9. Sources

**iroh:**

- Repository: <https://github.com/n0-computer/iroh>
- Documentation: <https://docs.iroh.computer/>
- NAT Traversal: <https://docs.iroh.computer/concepts/nat-traversal>
- Relays: <https://docs.iroh.computer/concepts/relays>
- LambdaClass interview: <https://blog.lambdaclass.com/the-wisdom-of-iroh/>

**noq:**

- Repository: <https://github.com/n0-computer/noq>
- Announcement blog: <https://www.iroh.computer/blog/noq-announcement>
- API docs: <https://docs.rs/noq>

**tun-rs:**

- Repository: <https://github.com/tun-rs/tun-rs>
- API docs: <https://docs.rs/tun-rs>

**Tailscale performance blog posts:**

- Post 1 (TSO/GRO): <https://tailscale.com/blog/throughput-improvements>
- Post 2 (UDP GSO, 10Gbps): <https://tailscale.com/blog/more-throughput>
- Post 3 (QUIC/UDP throughput): <https://tailscale.com/blog/quic-udp-throughput>

**boringtun:**

- Repository: <https://github.com/cloudflare/boringtun>
- Blog: <https://blog.cloudflare.com/boringtun-userspace-wireguard-rust/>

**TCP Meltdown:**

- Stack Overflow: <https://stackoverflow.com/questions/71049993/can-tcp-meltdown-happen-for-tcp-over-quic>
- OpenVPN docs: <https://openvpn.net/as-docs/faq-tcp-meltdown.html>

**RFC 9221 (QUIC Datagrams):** <https://www.rfc-editor.org/info/rfc9221/>

---

## 10. Summary

iroh + tun-rs is a solid technical choice. The main advantage: NAT traversal, relay infrastructure, peer discovery, QUIC multipath, and E2E encryption — all the really hard stuff — are ready out of the box. What remains to be built is the TUN routing layer (not trivial, but much simpler than NAT traversal from scratch) and the control plane.

The only trade-off: polished tunnel performance. Tailscale/wireguard-go have spent years on specific optimizations. We would have to do similar work, but the tools are there (tun-rs already supports offload, noq already supports GSO/GRO). For most use cases (SME networks, remote access, IoT), even 1-2 Gbps throughput is sufficient — and getting there with iroh + tun-rs doesn’t require all the optimizations.

**If throughput becomes a bottleneck someday**, you can replace the data plane layer (e.g. to boringtun) without touching the control plane. The architecture allows for this.
