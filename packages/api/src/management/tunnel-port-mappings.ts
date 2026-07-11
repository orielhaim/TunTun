import { z } from "zod";

export const tunnelPortMappingSchema = z.object({
  id: z.string().uuid(),
  tunnelId: z.string().uuid(),
  organizationId: z.string(),
  externalPort: z.number().int().min(1).max(65535),
  targetEndpointId: z.string().length(64).nullable(),
  targetPort: z.number().int().min(1).max(65535),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createTunnelPortMappingBody = z.object({
  externalPort: z.number().int().min(1).max(65535),
  targetPort: z.number().int().min(1).max(65535),
  targetEndpointId: z
    .string()
    .length(64)
    .regex(/^[0-9a-fA-F]+$/)
    .nullable()
    .optional(),
});

export const patchTunnelPortMappingBody = z
  .object({
    externalPort: z.number().int().min(1).max(65535).optional(),
    targetPort: z.number().int().min(1).max(65535).optional(),
    targetEndpointId: z
      .string()
      .length(64)
      .regex(/^[0-9a-fA-F]+$/)
      .nullable()
      .optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: "At least one field must be provided",
  });

export const tunnelPortMappingListResponse = z.object({
  portMappings: z.array(tunnelPortMappingSchema),
});

export type TunnelPortMapping = z.infer<typeof tunnelPortMappingSchema>;
export type CreateTunnelPortMappingBody = z.infer<
  typeof createTunnelPortMappingBody
>;
export type PatchTunnelPortMappingBody = z.infer<
  typeof patchTunnelPortMappingBody
>;
