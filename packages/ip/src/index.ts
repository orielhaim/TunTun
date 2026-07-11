import { Address4, Address6 } from "ip-address";
import { z } from "zod";

/** Host IPv4 (no prefix length). */
export function isIpv4(value: string): boolean {
  return Address4.isValid(value) && !value.includes("/");
}

export function isIpv6(value: string): boolean {
  return Address6.isValid(value) && !value.includes("/");
}

export function isIp(value: string): boolean {
  return isIpv4(value) || isIpv6(value);
}

export function isIpv4Cidr(value: string): boolean {
  return Address4.isValid(value);
}

export function isIpv6Cidr(value: string): boolean {
  return Address6.isValid(value);
}

export function isIpCidr(value: string): boolean {
  return isIpv4Cidr(value) || isIpv6Cidr(value);
}

/** Normalized host address (no prefix) for display / inet host columns. */
export function formatIp(value: string): string {
  if (Address4.isValid(value)) {
    return new Address4(value).correctForm();
  }
  if (Address6.isValid(value)) {
    return new Address6(value).correctForm();
  }
  throw new Error(`invalid IP address: ${value}`);
}

/**
 * Normalized IPv4 CIDR for Postgres `cidr` columns.
 * Must keep the prefix — `Address4.correctForm()` alone drops `/24` etc.,
 * and Postgres treats a bare address as `/32`.
 */
export function formatIpv4Cidr(value: string): string {
  const addr = new Address4(value);
  return `${addr.correctForm()}/${addr.subnetMask}`;
}

/** True when two IPv4 CIDRs share any address. */
export function ipv4CidrsOverlap(a: string, b: string): boolean {
  const left = new Address4(a);
  const right = new Address4(b);
  return left.isInSubnet(right) || right.isInSubnet(left);
}

/** True when `candidate` overlaps the mesh CIDR (same network or nested). */
export function overlapsMeshCidr(candidate: string, meshCidr: string): boolean {
  return ipv4CidrsOverlap(candidate, meshCidr);
}

export const ipv4Schema = z.string().refine(isIpv4, "invalid IPv4 address");

export const ipv4CidrSchema = z
  .string()
  .refine(isIpv4Cidr, "invalid IPv4 CIDR");

export const ipCidrSchema = z.string().refine(isIpCidr, "invalid IP CIDR");
