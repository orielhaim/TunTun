import { z } from "zod";

export const tunnelTrafficLogSchema = z.object({
  id: z.string().uuid(),
  tunnelId: z.string().uuid(),
  organizationId: z.string(),
  method: z.string(),
  path: z.string(),
  statusCode: z.number().int(),
  latencyMs: z.number().int(),
  sourceIp: z.string().nullable(),
  requestHeaders: z.record(z.string(), z.unknown()),
  responseHeaders: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
});

export const tunnelTrafficListResponse = z.object({
  logs: z.array(tunnelTrafficLogSchema),
});

export const relayTrafficLogLine = z.object({
  tunnelId: z.string().uuid(),
  method: z.string().min(1).max(16),
  path: z.string().min(1).max(2048),
  statusCode: z.number().int().min(100).max(599),
  latencyMs: z.number().int().nonnegative(),
  sourceIp: z.string().max(64).nullable().optional(),
  requestHeaders: z.record(z.string(), z.unknown()).optional(),
  responseHeaders: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime().optional(),
});

export const relayTrafficIngestBody = z.object({
  logs: z.array(relayTrafficLogLine).min(1).max(500),
});

export type TunnelTrafficLog = z.infer<typeof tunnelTrafficLogSchema>;
export type RelayTrafficIngestBody = z.infer<typeof relayTrafficIngestBody>;
