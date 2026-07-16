import { ipv4CidrSchema } from "@tunnet/ip";
import { z } from "zod";

export const subnetRouteSchema = z.object({
  id: z.string().uuid(),
  endpointId: z.string().length(64),
  networkId: z.string().uuid(),
  cidr: z.string(),
  description: z.string().nullable(),
  enabled: z.boolean(),
  createdAt: z.string().datetime(),
  /** Present on list responses for UI convenience. */
  hostname: z.string().optional(),
  viaIp: z.string().optional(),
});

export const createSubnetRouteBody = z.object({
  endpointId: z
    .string()
    .length(64)
    .regex(/^[0-9a-fA-F]+$/),
  cidr: ipv4CidrSchema,
  description: z.string().max(256).optional(),
  enabled: z.boolean().default(true),
});

export const patchSubnetRouteBody = z
  .object({
    description: z.string().max(256).nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (body) => body.description !== undefined || body.enabled !== undefined,
    { message: "At least one field must be provided" },
  );

export const subnetRouteListResponse = z.object({
  routes: z.array(subnetRouteSchema),
});

export type SubnetRoute = z.infer<typeof subnetRouteSchema>;
export type CreateSubnetRouteBody = z.infer<typeof createSubnetRouteBody>;
export type PatchSubnetRouteBody = z.infer<typeof patchSubnetRouteBody>;
