import { ipv4Schema } from "@tuntun/ip";
import { z } from "zod";

const hostnameSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(
    /^(\*\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i,
    "invalid hostname (use host.example or *.example)",
  );

export const hostnameRouteSchema = z.object({
  id: z.string().uuid(),
  endpointId: z.string().length(64),
  networkId: z.string().uuid(),
  hostname: z.string(),
  isWildcard: z.boolean(),
  targetIp: z.string().nullable(),
  description: z.string().nullable(),
  enabled: z.boolean(),
  createdAt: z.string().datetime(),
  hostnameLabel: z.string().optional(),
  viaIp: z.string().optional(),
});

export const createHostnameRouteBody = z.object({
  endpointId: z
    .string()
    .length(64)
    .regex(/^[0-9a-fA-F]+$/),
  hostname: hostnameSchema,
  targetIp: ipv4Schema.optional(),
  description: z.string().max(256).optional(),
  enabled: z.boolean().default(true),
});

export const patchHostnameRouteBody = z
  .object({
    targetIp: ipv4Schema.nullable().optional(),
    description: z.string().max(256).nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (body) =>
      body.targetIp !== undefined ||
      body.description !== undefined ||
      body.enabled !== undefined,
    { message: "At least one field must be provided" },
  );

export const hostnameRouteListResponse = z.object({
  routes: z.array(hostnameRouteSchema),
});

export type HostnameRoute = z.infer<typeof hostnameRouteSchema>;
export type CreateHostnameRouteBody = z.infer<typeof createHostnameRouteBody>;
export type PatchHostnameRouteBody = z.infer<typeof patchHostnameRouteBody>;

/** Normalize `*.foo.bar` → `{ hostname: "foo.bar", isWildcard: true }`. */
export function parseHostnameInput(raw: string): {
  hostname: string;
  isWildcard: boolean;
} {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.startsWith("*.")) {
    return { hostname: trimmed.slice(2), isWildcard: true };
  }
  return { hostname: trimmed, isWildcard: false };
}

export function formatHostnameLabel(
  hostname: string,
  isWildcard: boolean,
): string {
  return isWildcard ? `*.${hostname}` : hostname;
}
