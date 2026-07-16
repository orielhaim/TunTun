import { ipCidrSchema } from "@tunnet/ip";
import { z } from "zod";

const cidrSelector = z.object({
  kind: z.literal("cidr"),
  value: ipCidrSchema,
});

export const selectorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("any") }),
  z.object({ kind: z.literal("endpoint"), value: z.string() }),
  z.object({ kind: z.literal("tag"), value: z.string() }),
  z.object({ kind: z.literal("network"), value: z.string() }),
  cidrSelector,
]);

export const portRangeSchema = z.object({
  start: z.number().int().min(0).max(65535),
  end: z.number().int().min(0).max(65535),
});

export const policyScopeSchema = z.enum(["network", "organization"]);

export const policySchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  networkId: z.string().uuid().nullable(),
  scope: policyScopeSchema,
  srcSelector: selectorSchema,
  dstSelector: selectorSchema,
  action: z.enum(["allow", "deny"]),
  ports: z.array(portRangeSchema),
  protocol: z.enum(["tcp", "udp", "icmp", "any"]).nullable(),
  priority: z.number().int(),
  createdAt: z.string().datetime(),
});

export const createPolicyBody = z.object({
  srcSelector: selectorSchema,
  dstSelector: selectorSchema,
  action: z.enum(["allow", "deny"]),
  ports: z.array(portRangeSchema).default([]),
  protocol: z.enum(["tcp", "udp", "icmp", "any"]).nullable().optional(),
  priority: z.number().int().default(0),
});

export const patchPolicyBody = createPolicyBody.partial();

export const policyListResponse = z.object({
  policies: z.array(policySchema),
});

export type Policy = z.infer<typeof policySchema>;
export type CreatePolicyBody = z.infer<typeof createPolicyBody>;
export type PatchPolicyBody = z.infer<typeof patchPolicyBody>;
export type Selector = z.infer<typeof selectorSchema>;
export type PolicyScope = z.infer<typeof policyScopeSchema>;
