import { z } from "zod";

export const relayHeartbeatSampleSchema = z.object({
  id: z.string().uuid(),
  relayId: z.string().uuid(),
  activeTunnels: z.number().int().nonnegative(),
  recordedAt: z.string().datetime(),
});

export const relayCertInfoSchema = z.object({
  validUntil: z.string().datetime().nullable(),
});

export const relayHealthResponse = z.object({
  heartbeats: z.array(relayHeartbeatSampleSchema),
  cert: relayCertInfoSchema,
  lastHeartbeatAt: z.string().datetime().nullable(),
  status: z.string(),
  activeTunnels: z.number().int().nonnegative(),
});

export type RelayHeartbeatSample = z.infer<typeof relayHeartbeatSampleSchema>;
export type RelayHealthResponse = z.infer<typeof relayHealthResponse>;
