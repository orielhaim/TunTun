import { z } from "zod";

export const nodeGroupSchema = z.object({
  id: z.string().uuid(),
  networkId: z.string().uuid(),
  name: z.string(),
  haEnabled: z.boolean(),
  activeEndpointId: z.string().length(64).nullable(),
  createdAt: z.string().datetime(),
  members: z
    .array(
      z.object({
        endpointId: z.string().length(64),
        priority: z.number().int(),
        joinedAt: z.string().datetime(),
        hostname: z.string().optional(),
      }),
    )
    .optional(),
});

export const createNodeGroupBody = z.object({
  name: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  haEnabled: z.boolean().default(true),
  members: z
    .array(
      z.object({
        endpointId: z
          .string()
          .length(64)
          .regex(/^[0-9a-fA-F]+$/),
        priority: z.number().int().min(0).max(1000).default(100),
      }),
    )
    .min(1)
    .max(16),
});

export const patchNodeGroupBody = z.object({
  name: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  haEnabled: z.boolean().optional(),
  activeEndpointId: z.string().length(64).nullable().optional(),
});

export const nodeGroupListResponse = z.object({
  groups: z.array(nodeGroupSchema),
});

export type NodeGroup = z.infer<typeof nodeGroupSchema>;
export type CreateNodeGroupBody = z.infer<typeof createNodeGroupBody>;
export type PatchNodeGroupBody = z.infer<typeof patchNodeGroupBody>;
