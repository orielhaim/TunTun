import { Address4, Address6 } from "ip-address";

export function isIpv4(value: string): boolean {
  return Address4.isValid(value);
}

export function isIpv6(value: string): boolean {
  return Address6.isValid(value);
}

export function isIp(value: string): boolean {
  return isIpv4(value) || isIpv6(value);
}

export function isIpv4Cidr(value: string): boolean {
  return Address4.isValid(value);
}

export function isIpCidr(value: string): boolean {
  return isIpv4Cidr(value) || isIpv6(value);
}

/** Normalized host or CIDR string for Postgres `inet` / `cidr` columns. */
export function formatIp(value: string): string {
  if (Address4.isValid(value)) {
    return new Address4(value).correctForm();
  }
  if (Address6.isValid(value)) {
    return new Address6(value).correctForm();
  }
  throw new Error(`invalid IP address: ${value}`);
}

export function formatIpv4Cidr(value: string): string {
  return new Address4(value).correctForm();
}
