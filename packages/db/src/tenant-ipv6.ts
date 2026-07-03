import { blake3 } from "@awasm/noble";
import { Address6 } from "ip-address";

/** ULA prefix `fd7a:7475:7475::/48` — mnemonic for "tuntun". */
const TENANT_IPV6_PREFIX = [0xfd, 0x7a, 0x74, 0x75, 0x74, 0x75] as const;
const DERIVE_CONTEXT = "tuntun/tenant-ipv6/v1";

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Stable tenant IPv6 from a 64-char hex endpoint_id (matches `tuntun-common::ipv6`). */
export function deriveTenantIpv6(endpointId: string): string {
  if (endpointId.length !== 64 || !/^[0-9a-fA-F]+$/.test(endpointId)) {
    throw new Error("invalid endpoint id");
  }

  const pubkey = hexToBytes(endpointId.toLowerCase());
  const hash = blake3(pubkey, {
    context: new TextEncoder().encode(DERIVE_CONTEXT),
  });

  let iface = 0n;
  for (let i = 0; i < 8; i++) {
    iface = (iface << 8n) | BigInt(hash[i]!);
  }
  iface |= 1n << 63n;

  const octets = [
    TENANT_IPV6_PREFIX[0]!,
    TENANT_IPV6_PREFIX[1]!,
    TENANT_IPV6_PREFIX[2]!,
    TENANT_IPV6_PREFIX[3]!,
    TENANT_IPV6_PREFIX[4]!,
    TENANT_IPV6_PREFIX[5]!,
    0,
    0,
    0,
    0,
    Number((iface >> 56n) & 0xffn),
    Number((iface >> 48n) & 0xffn),
    Number((iface >> 40n) & 0xffn),
    Number((iface >> 32n) & 0xffn),
    Number((iface >> 24n) & 0xffn),
    Number((iface >> 16n) & 0xffn),
  ];

  return Address6.fromByteArray(octets).correctForm();
}
