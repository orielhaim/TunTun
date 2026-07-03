import { z } from "zod";

import { selectorSchema as policySelectorSchema } from "./policies";

export const organizationPolicySchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  srcSelector: policySelectorSchema,
  dstSelector: policySelectorSchema,
  action: z.enum(["allow", "deny"]),
  ports: z.array(
    z.object({
      start: z.number().int().min(0).max(65535),
      end: z.number().int().min(0).max(65535),
    }),
  ),
  protocol: z.enum(["tcp", "udp", "icmp", "any"]).nullable(),
  priority: z.number().int(),
  createdAt: z.string().datetime(),
});

export const createOrganizationPolicyBody = z.object({
  srcSelector: policySelectorSchema,
  dstSelector: policySelectorSchema,
  action: z.enum(["allow", "deny"]),
  ports: z
    .array(
      z.object({
        start: z.number().int().min(0).max(65535),
        end: z.number().int().min(0).max(65535),
      }),
    )
    .default([]),
  protocol: z.enum(["tcp", "udp", "icmp", "any"]).optional(),
  priority: z.number().int().default(0),
});

export const patchOrganizationPolicyBody =
  createOrganizationPolicyBody.partial();

export const organizationPolicyListResponse = z.object({
  policies: z.array(organizationPolicySchema),
});

export type OrganizationPolicy = z.infer<typeof organizationPolicySchema>;
export type CreateOrganizationPolicyBody = z.infer<
  typeof createOrganizationPolicyBody
>;
export type PatchOrganizationPolicyBody = z.infer<
  typeof patchOrganizationPolicyBody
>;
