import { z } from "zod";

export const devicePresenceEventSchema = z.enum([
  "connected",
  "disconnected",
  "heartbeat_missed",
]);

export const devicePresenceUpdateSchema = z.object({
  organizationId: z.string(),
  endpointId: z.string().length(64),
});

export const devicePresenceEventRecordSchema = z.object({
  id: z.number(),
  endpointId: z.string().length(64),
  organizationId: z.string(),
  networkId: z.string().uuid(),
  event: devicePresenceEventSchema,
  publicIp: z.string().nullable(),
  at: z.string().datetime(),
});

export const devicePresenceHistoryResponse = z.object({
  events: z.array(devicePresenceEventRecordSchema),
});

export type DevicePresenceUpdate = z.infer<typeof devicePresenceUpdateSchema>;
export type DevicePresenceEventRecord = z.infer<
  typeof devicePresenceEventRecordSchema
>;
