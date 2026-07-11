import { z } from "zod";

export const tunnelStatusSchema = z.enum([
  "connecting",
  "active",
  "error",
  "stopped",
  "expired",
]);

export const tunnelProtocolSchema = z.enum(["https", "tcp"]);

export const tunnelBasicAuthSchema = z.object({
  username: z.string().min(1).max(128),
  /** Present when basic auth is configured; password itself is never returned. */
  enabled: z.literal(true),
});

export const tunnelBasicAuthInputSchema = z.object({
  username: z.string().min(1).max(128),
  password: z.string().min(1).max(256),
});

export const tunnelSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  networkId: z.string().uuid(),
  endpointId: z.string().length(64),
  relayId: z.string().uuid().nullable(),
  localPort: z.number().int().min(1).max(65535),
  protocol: tunnelProtocolSchema,
  subdomain: z.string(),
  publicHostname: z.string(),
  status: tunnelStatusSchema,
  errorMessage: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  /** Username only when basic auth is configured; never includes password/hash. */
  basicAuth: tunnelBasicAuthSchema.nullable().default(null),
  /** Present on list responses. */
  hostname: z.string().optional(),
  relayName: z.string().optional(),
});

export const createTunnelBody = z.object({
  endpointId: z
    .string()
    .length(64)
    .regex(/^[0-9a-fA-F]+$/),
  localPort: z.number().int().min(1).max(65535),
  protocol: tunnelProtocolSchema.default("https"),
  /** Omit / "auto" → CP picks closest healthy relay. */
  relayId: z.string().uuid().optional(),
  subdomain: z
    .string()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/)
    .optional(),
  /** Seconds until auto-expire; omit = never. */
  ttlSeconds: z.number().int().positive().optional(),
  /** Optional HTTP basic auth for public visitors. */
  basicAuth: tunnelBasicAuthInputSchema.nullable().optional(),
});

export const tunnelListResponse = z.object({
  tunnels: z.array(tunnelSchema),
});

export const createTunnelResponse = z.object({
  tunnel: tunnelSchema,
  relayAuthToken: z.string(),
});

export const patchTunnelBody = z
  .object({
    localPort: z.number().int().min(1).max(65535).optional(),
    subdomain: z
      .string()
      .min(1)
      .max(63)
      .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/)
      .optional(),
    ttlSeconds: z.number().int().positive().nullable().optional(),
    relayId: z.string().uuid().nullable().optional(),
    /** Disable a tunnel (maps to status stopped). */
    status: z.enum(["stopped"]).optional(),
    /** Set credentials, or null to clear basic auth. */
    basicAuth: tunnelBasicAuthInputSchema.nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: "At least one field must be provided",
  });

export type Tunnel = z.infer<typeof tunnelSchema>;
export type CreateTunnelBody = z.infer<typeof createTunnelBody>;
export type CreateTunnelResponse = z.infer<typeof createTunnelResponse>;
export type PatchTunnelBody = z.infer<typeof patchTunnelBody>;
export type TunnelBasicAuthInput = z.infer<typeof tunnelBasicAuthInputSchema>;
