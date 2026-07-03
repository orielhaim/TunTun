import { z } from "zod";

export const apiKeySchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  name: z.string(),
  scopes: z.array(z.string()),
  expiresAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export const createApiKeyBody = z.object({
  name: z.string().min(1).max(128),
  scopes: z.array(z.string()).default([]),
  expiresAt: z.string().datetime().optional(),
});

export const createApiKeyResponse = z.object({
  secret: z.string(),
  apiKey: apiKeySchema,
});

export const apiKeyListResponse = z.object({
  apiKeys: z.array(apiKeySchema),
});

export type ApiKey = z.infer<typeof apiKeySchema>;
export type CreateApiKeyBody = z.infer<typeof createApiKeyBody>;
