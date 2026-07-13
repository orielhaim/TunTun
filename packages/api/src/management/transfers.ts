import { z } from "zod";

export const transferStatusSchema = z.enum([
  "offered",
  "pending",
  "transferring",
  "completed",
  "failed",
  "rejected",
]);

export const fileTransferSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  networkId: z.string().uuid(),
  senderEndpointId: z.string(),
  receiverEndpointId: z.string().nullable(),
  fileName: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  blake3Hash: z.string(),
  status: transferStatusSchema,
  progressPct: z.number().int().min(0).max(100),
  bytesTransferred: z.number().int().nonnegative(),
  error: z.string().nullable(),
  message: z.string().nullable(),
  inboxPath: z.string().nullable(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});

export const fileTransferListResponse = z.object({
  transfers: z.array(fileTransferSchema),
});

export const sendConsentModeSchema = z.enum(["auto_accept", "prompt", "deny"]);

export const endpointSendSettingsSchema = z.object({
  endpointId: z.string(),
  organizationId: z.string(),
  consentMode: sendConsentModeSchema,
  inboxPath: z.string().nullable(),
  pinBlobs: z.boolean(),
  updatedAt: z.string().datetime(),
});

export const updateSendSettingsBody = z.object({
  consentMode: sendConsentModeSchema.optional(),
  inboxPath: z.string().nullable().optional(),
  pinBlobs: z.boolean().optional(),
});

export const acceptRejectTransferBody = z.object({
  endpointId: z.string().min(1),
  reason: z.string().optional(),
});

export const createTransferBody = z.object({
  senderEndpointId: z.string().min(1),
  path: z.string().min(1),
  target: z.string().min(1),
  message: z.string().optional(),
});

export type FileTransfer = z.infer<typeof fileTransferSchema>;
export type EndpointSendSettings = z.infer<typeof endpointSendSettingsSchema>;
export type UpdateSendSettingsBody = z.infer<typeof updateSendSettingsBody>;
