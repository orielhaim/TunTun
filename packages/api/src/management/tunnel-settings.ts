import { z } from "zod";

export const organizationTunnelSettingsSchema = z.object({
  organizationId: z.string(),
  defaultRelayId: z.string().uuid().nullable(),
  defaultTtlSeconds: z.number().int().positive().nullable(),
  maxTunnelsPerMachine: z.number().int().positive(),
  peerDnsSuffix: z.string().nullable(),
  customTunnelDomain: z.string().nullable(),
  updatedAt: z.string().datetime(),
});

export const patchOrganizationTunnelSettingsBody = z
  .object({
    defaultRelayId: z.string().uuid().nullable().optional(),
    defaultTtlSeconds: z.number().int().positive().nullable().optional(),
    maxTunnelsPerMachine: z.number().int().min(1).max(1000).optional(),
    peerDnsSuffix: z.string().min(1).max(253).nullable().optional(),
    customTunnelDomain: z.string().min(1).max(253).nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: "At least one field must be provided",
  });

export type OrganizationTunnelSettings = z.infer<
  typeof organizationTunnelSettingsSchema
>;
export type PatchOrganizationTunnelSettingsBody = z.infer<
  typeof patchOrganizationTunnelSettingsBody
>;
