import { z } from "zod";

export const enrollmentTokenSchema = z.object({
  tokenHash: z.string(),
  networkId: z.string().uuid(),
  expiresAt: z.string().datetime(),
  usedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export const createEnrollmentTokenBody = z.object({
  ttlMinutes: z.number().int().min(1).max(10080).default(15),
});

export const createEnrollmentTokenResponse = z.object({
  token: z.string(),
  tokenHash: z.string(),
  expiresAt: z.string().datetime(),
  enrollmentToken: enrollmentTokenSchema,
});

export const enrollmentTokenListResponse = z.object({
  tokens: z.array(enrollmentTokenSchema),
});

export type EnrollmentToken = z.infer<typeof enrollmentTokenSchema>;
export type CreateEnrollmentTokenBody = z.infer<
  typeof createEnrollmentTokenBody
>;
