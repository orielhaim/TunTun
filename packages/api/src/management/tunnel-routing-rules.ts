import { z } from "zod";

const endpointIdSchema = z
  .string()
  .length(64)
  .regex(/^[0-9a-fA-F]+$/)
  .nullable();

const routingRuleBase = {
  id: z.string().uuid(),
  tunnelId: z.string().uuid(),
  organizationId: z.string(),
  priority: z.number().int(),
  targetEndpointId: z.string().length(64).nullable(),
  targetPort: z.number().int().min(1).max(65535),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
};

export const tunnelRoutingRuleSchema = z.discriminatedUnion("kind", [
  z.object({
    ...routingRuleBase,
    kind: z.literal("path"),
    pathPattern: z.string().min(1),
    externalPort: z.null(),
  }),
  z.object({
    ...routingRuleBase,
    kind: z.literal("port"),
    pathPattern: z.null(),
    externalPort: z.number().int().min(1).max(65535),
  }),
]);

export const createTunnelRoutingRuleBody = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("path"),
    pathPattern: z.string().min(1).max(512),
    targetPort: z.number().int().min(1).max(65535),
    targetEndpointId: endpointIdSchema.optional(),
    priority: z.number().int().default(0),
  }),
  z.object({
    kind: z.literal("port"),
    externalPort: z.number().int().min(1).max(65535),
    targetPort: z.number().int().min(1).max(65535),
    targetEndpointId: endpointIdSchema.optional(),
    priority: z.number().int().default(0),
  }),
]);

export const patchTunnelRoutingRuleBody = z
  .object({
    pathPattern: z.string().min(1).max(512).optional(),
    externalPort: z.number().int().min(1).max(65535).optional(),
    targetPort: z.number().int().min(1).max(65535).optional(),
    targetEndpointId: endpointIdSchema.optional(),
    priority: z.number().int().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: "At least one field must be provided",
  });

export const tunnelRoutingRuleListResponse = z.object({
  routingRules: z.array(tunnelRoutingRuleSchema),
});

export type TunnelRoutingRule = z.infer<typeof tunnelRoutingRuleSchema>;
export type CreateTunnelRoutingRuleBody = z.input<
  typeof createTunnelRoutingRuleBody
>;
export type PatchTunnelRoutingRuleBody = z.infer<
  typeof patchTunnelRoutingRuleBody
>;
