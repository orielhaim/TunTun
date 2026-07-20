import { z } from "zod";

const tagNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-_]*$/);

export const enrollmentTokenSchema = z.object({
  tokenHash: z.string(),
  networkId: z.string().uuid(),
  tags: z.array(z.string()).default([]),
  expiresAt: z.string().datetime(),
  usedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export const createEnrollmentTokenBody = z.object({
  ttlMinutes: z.number().int().min(1).max(10080).default(15),
  tags: z.array(tagNameSchema).max(64).default([]),
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
export type CreateEnrollmentTokenBody = z.input<
  typeof createEnrollmentTokenBody
>;
