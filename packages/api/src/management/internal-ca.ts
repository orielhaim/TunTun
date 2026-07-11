import { z } from "zod";

export const internalCaStatusSchema = z.enum(["healthy", "expired", "missing"]);

export const internalCaSchema = z.object({
  fingerprintSha256: z.string().nullable(),
  notBefore: z.string().datetime().nullable(),
  notAfter: z.string().datetime().nullable(),
  status: internalCaStatusSchema,
  rotatedAt: z.string().datetime().nullable(),
});

export const rotateInternalCaResponse = z.object({
  fingerprintSha256: z.string(),
  notBefore: z.string().datetime(),
  notAfter: z.string().datetime(),
  status: z.literal("healthy"),
  rotatedAt: z.string().datetime(),
});

export type InternalCa = z.infer<typeof internalCaSchema>;
export type RotateInternalCaResponse = z.infer<typeof rotateInternalCaResponse>;
