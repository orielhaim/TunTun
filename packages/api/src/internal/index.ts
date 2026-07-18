import { z } from "zod";

export const internalHealthResponse = z.object({
  status: z.literal("ok"),
  version: z.string(),
  wsConnections: z.number().int().nonnegative(),
  listenConnected: z.boolean(),
});

export const internalReadyResponse = z.object({
  ready: z.boolean(),
  db: z.boolean(),
  listen: z.boolean(),
});

export const validateNetworkResponse = z.object({
  networkId: z.string().uuid(),
  organizationId: z.string(),
  version: z.number().int().nonnegative(),
  deviceCount: z.number().int().nonnegative(),
});

export const registerDeviceBody = z.object({
  endpointId: z.string().length(64),
  organizationId: z.string(),
  networkId: z.string().uuid(),
  hostname: z.string().min(1).max(253),
  os: z.string().optional(),
  agentVersion: z.string().optional(),
  deviceType: z.enum(["agent", "sdk", "k8s"]).default("sdk"),
  metadata: z.record(z.string(), z.unknown()).optional(),
  labels: z.record(z.string(), z.string()).optional(),
  expiresIn: z.string().min(1).max(64).optional(),
});

export const registerDeviceResponse = z.object({
  organizationId: z.string(),
  networkId: z.string().uuid(),
  networkName: z.string(),
  snapshot: z.record(z.string(), z.unknown()),
});

export type InternalHealthResponse = z.infer<typeof internalHealthResponse>;
export type InternalReadyResponse = z.infer<typeof internalReadyResponse>;
export type ValidateNetworkResponse = z.infer<typeof validateNetworkResponse>;
export type RegisterDeviceBody = z.infer<typeof registerDeviceBody>;
export type RegisterDeviceResponse = z.infer<typeof registerDeviceResponse>;
