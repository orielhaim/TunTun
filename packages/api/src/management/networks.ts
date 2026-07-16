import { ipv4CidrSchema } from "@tunnet/ip";
import { z } from "zod";

const networkNameSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9-]+$/);

export const networkSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  name: networkNameSchema,
  cidr: z.string(),
  mtu: z.number().int().min(576).max(9000),
  version: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export const createNetworkBody = z.object({
  name: networkNameSchema,
  cidr: ipv4CidrSchema,
  mtu: z.number().int().min(576).max(9000).default(1280),
});

export const patchNetworkBody = z.object({
  name: networkNameSchema.optional(),
  cidr: ipv4CidrSchema.optional(),
  mtu: z.number().int().min(576).max(9000).optional(),
});

export const networkListResponse = z.object({
  networks: z.array(networkSchema),
});

export type Network = z.infer<typeof networkSchema>;
export type CreateNetworkBody = z.infer<typeof createNetworkBody>;
export type PatchNetworkBody = z.infer<typeof patchNetworkBody>;
