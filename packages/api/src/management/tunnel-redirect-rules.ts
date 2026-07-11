import { z } from "zod";

export const tunnelRedirectRuleSchema = z.object({
  id: z.string().uuid(),
  tunnelId: z.string().uuid(),
  organizationId: z.string(),
  priority: z.number().int(),
  pathPattern: z.string().min(1),
  targetEndpointId: z.string().length(64).nullable(),
  targetPort: z.number().int().min(1).max(65535),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createTunnelRedirectRuleBody = z.object({
  pathPattern: z.string().min(1).max(512),
  targetPort: z.number().int().min(1).max(65535),
  targetEndpointId: z
    .string()
    .length(64)
    .regex(/^[0-9a-fA-F]+$/)
    .nullable()
    .optional(),
  priority: z.number().int().default(0),
});

export const patchTunnelRedirectRuleBody = z
  .object({
    pathPattern: z.string().min(1).max(512).optional(),
    targetPort: z.number().int().min(1).max(65535).optional(),
    targetEndpointId: z
      .string()
      .length(64)
      .regex(/^[0-9a-fA-F]+$/)
      .nullable()
      .optional(),
    priority: z.number().int().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: "At least one field must be provided",
  });

export const tunnelRedirectRuleListResponse = z.object({
  redirectRules: z.array(tunnelRedirectRuleSchema),
});

export type TunnelRedirectRule = z.infer<typeof tunnelRedirectRuleSchema>;
export type CreateTunnelRedirectRuleBody = z.infer<
  typeof createTunnelRedirectRuleBody
>;
export type PatchTunnelRedirectRuleBody = z.infer<
  typeof patchTunnelRedirectRuleBody
>;
