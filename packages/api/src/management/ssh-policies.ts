import { z } from "zod";
import { selectorSchema } from "./policies";

export const sshPolicySchema = z.object({
  id: z.string().uuid(),
  networkId: z.string().uuid(),
  srcSelector: selectorSchema,
  dstSelector: selectorSchema,
  action: z.enum(["accept", "check", "deny"]),
  users: z.array(z.string().min(1).max(64)),
  record: z.boolean(),
  recorder: selectorSchema.nullable(),
  enforceRecorder: z.boolean(),
  checkPeriodSecs: z.number().int().positive().nullable(),
  priority: z.number().int(),
  createdAt: z.string().datetime(),
});

export const createSshPolicyBody = z
  .object({
    srcSelector: selectorSchema,
    dstSelector: selectorSchema,
    action: z.enum(["accept", "check", "deny"]),
    users: z.array(z.string().min(1).max(64)).min(1),
    record: z.boolean().default(false),
    recorder: selectorSchema.nullable().optional(),
    enforceRecorder: z.boolean().default(false),
    checkPeriodSecs: z.number().int().positive().nullable().optional(),
    priority: z.number().int().default(0),
  })
  .superRefine((body, ctx) => {
    if (body.action === "check" && !body.checkPeriodSecs) {
      ctx.addIssue({
        code: "custom",
        message: "checkPeriodSecs is required when action is check",
        path: ["checkPeriodSecs"],
      });
    }
  });

export const patchSshPolicyBody = z.object({
  srcSelector: selectorSchema.optional(),
  dstSelector: selectorSchema.optional(),
  action: z.enum(["accept", "check", "deny"]).optional(),
  users: z.array(z.string().min(1).max(64)).min(1).optional(),
  record: z.boolean().optional(),
  recorder: selectorSchema.nullable().optional(),
  enforceRecorder: z.boolean().optional(),
  checkPeriodSecs: z.number().int().positive().nullable().optional(),
  priority: z.number().int().optional(),
});

export const sshPolicyListResponse = z.object({
  policies: z.array(sshPolicySchema),
});

export const sshSessionSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  networkId: z.string().uuid(),
  srcEndpointId: z.string(),
  dstEndpointId: z.string(),
  srcHostname: z.string().nullable(),
  dstHostname: z.string().nullable(),
  targetUser: z.string(),
  status: z.enum(["active", "ended", "killed"]),
  recorded: z.boolean(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  durationMs: z.number().int().nullable(),
});

export const sshSessionListResponse = z.object({
  sessions: z.array(sshSessionSchema),
});

export const sshRecordingSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  organizationId: z.string(),
  networkId: z.string().uuid(),
  recorderEndpointId: z.string(),
  contentSha256: z.string(),
  byteSize: z.number().int(),
  durationMs: z.number().int().nullable(),
  createdAt: z.string().datetime(),
  srcHostname: z.string().nullable().optional(),
  dstHostname: z.string().nullable().optional(),
  targetUser: z.string().nullable().optional(),
});

export const sshRecordingListResponse = z.object({
  recordings: z.array(sshRecordingSchema),
});

export const sshRecordingCastResponse = z.object({
  sessionId: z.string().uuid(),
  contentSha256: z.string(),
  castText: z.string(),
  byteSize: z.number().int().optional(),
});

export type SshPolicy = z.infer<typeof sshPolicySchema>;
export type CreateSshPolicyBody = z.infer<typeof createSshPolicyBody>;
export type PatchSshPolicyBody = z.infer<typeof patchSshPolicyBody>;
export type SshSession = z.infer<typeof sshSessionSchema>;
export type SshRecording = z.infer<typeof sshRecordingSchema>;
export type SshRecordingCast = z.infer<typeof sshRecordingCastResponse>;
