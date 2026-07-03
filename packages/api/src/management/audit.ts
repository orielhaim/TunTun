import { z } from "zod";

export const auditEntrySchema = z.object({
  id: z.number().int(),
  organizationId: z.string().nullable(),
  actor: z.string().nullable(),
  action: z.string(),
  target: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  traceId: z.string().nullable(),
  at: z.string().datetime(),
});

export const auditListResponse = z.object({
  entries: z.array(auditEntrySchema),
  nextCursor: z.number().int().nullable(),
});

export type AuditEntry = z.infer<typeof auditEntrySchema>;
