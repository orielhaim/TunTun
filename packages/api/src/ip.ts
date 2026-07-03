import { Address4, Address6 } from "ip-address";
import { z } from "zod";

export function isIpv4Cidr(value: string): boolean {
  return Address4.isValid(value);
}

export function isIpCidr(value: string): boolean {
  return Address4.isValid(value) || Address6.isValid(value);
}

export const ipv4CidrSchema = z
  .string()
  .refine(isIpv4Cidr, "invalid IPv4 CIDR");

export const ipCidrSchema = z.string().refine(isIpCidr, "invalid IP CIDR");
