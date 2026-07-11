import { z } from "zod";

export const relayStatusSchema = z.enum([
  "pending",
  "healthy",
  "degraded",
  "offline",
  "disabled",
]);

export const relayKindSchema = z.enum(["hosted", "self_hosted"]);

export const relaySchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  name: z.string().min(1).max(64),
  kind: relayKindSchema,
  region: z.string(),
  publicIp: z.string().nullable(),
  domain: z.string().min(1),
  capacityLimit: z.number().int().positive(),
  activeTunnels: z.number().int().nonnegative(),
  status: relayStatusSchema,
  lastHeartbeatAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createRelayBody = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/),
  region: z.string().min(1).max(64).default("unknown"),
  domain: z.string().min(1).max(253),
  publicIp: z.string().optional(),
  capacityLimit: z.number().int().min(1).max(100_000).default(100),
  kind: relayKindSchema.default("self_hosted"),
});

export const patchRelayBody = z
  .object({
    name: z.string().min(1).max(64).optional(),
    region: z.string().min(1).max(64).optional(),
    domain: z.string().min(1).max(253).optional(),
    publicIp: z.string().nullable().optional(),
    capacityLimit: z.number().int().min(1).max(100_000).optional(),
    status: z.enum(["healthy", "degraded", "offline", "disabled"]).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: "At least one field must be provided",
  });

export const relayListResponse = z.object({
  relays: z.array(relaySchema),
});

export const createRelayResponse = z.object({
  relay: relaySchema,
  /** One-time registration token (plaintext, shown once). */
  registrationToken: z.string(),
  expiresAt: z.string().datetime(),
});

export type Relay = z.infer<typeof relaySchema>;
export type CreateRelayBody = z.infer<typeof createRelayBody>;
export type PatchRelayBody = z.infer<typeof patchRelayBody>;
