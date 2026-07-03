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

export type InternalHealthResponse = z.infer<typeof internalHealthResponse>;
export type InternalReadyResponse = z.infer<typeof internalReadyResponse>;
export type ValidateNetworkResponse = z.infer<typeof validateNetworkResponse>;
