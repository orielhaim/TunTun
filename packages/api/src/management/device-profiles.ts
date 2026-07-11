import { z } from "zod";

import { ipv4CidrSchema } from "@tuntun/ip";

export const exitNodeSchema = z.object({
  endpointId: z.string().length(64),
  networkId: z.string().uuid(),
  enabled: z.boolean(),
  allowedCidrs: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  hostname: z.string().optional(),
  viaIp: z.string().optional(),
});

export const upsertExitNodeBody = z.object({
  enabled: z.boolean().default(true),
  allowedCidrs: z.array(ipv4CidrSchema).min(1).default(["0.0.0.0/0"]),
});

export const exitNodeListResponse = z.object({
  exitNodes: z.array(exitNodeSchema),
});

export const splitTunnelModeSchema = z.enum(["include", "exclude"]);

export const deviceProfileSchema = z.object({
  endpointId: z.string().length(64),
  networkId: z.string().uuid(),
  exitNodeEndpointId: z.string().length(64).nullable(),
  splitTunnelMode: splitTunnelModeSchema,
  splitTunnelCidrs: z.array(z.string()),
  updatedAt: z.string().datetime(),
});

export const upsertDeviceProfileBody = z.object({
  exitNodeEndpointId: z.string().length(64).nullable().optional(),
  splitTunnelMode: splitTunnelModeSchema.optional(),
  splitTunnelCidrs: z.array(ipv4CidrSchema).optional(),
});

export const deviceProfileListResponse = z.object({
  profiles: z.array(deviceProfileSchema),
});

export type ExitNode = z.infer<typeof exitNodeSchema>;
export type UpsertExitNodeBody = z.infer<typeof upsertExitNodeBody>;
export type DeviceProfile = z.infer<typeof deviceProfileSchema>;
export type UpsertDeviceProfileBody = z.infer<typeof upsertDeviceProfileBody>;
