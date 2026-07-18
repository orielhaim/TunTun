import { z } from "zod";

export const API_KEY_SCOPE_VALUES = ["sdk:enroll", "sdk:manage"] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPE_VALUES)[number];

export const SDK_ENROLL_SCOPE: ApiKeyScope = "sdk:enroll";
export const SDK_MANAGE_SCOPE: ApiKeyScope = "sdk:manage";

export const API_KEY_SCOPES: ReadonlyArray<{
  id: ApiKeyScope;
  label: string;
  description: string;
}> = [
  {
    id: SDK_ENROLL_SCOPE,
    label: "Enroll SDK nodes",
    description:
      "Register SDK runtimes in allowed networks. Idempotent per endpoint ID.",
  },
  {
    id: SDK_MANAGE_SCOPE,
    label: "Manage SDK / K8s nodes",
    description:
      "Enroll and delete operator-managed or SDK nodes in allowed networks.",
  },
];

export const apiKeyScopeSchema = z.enum(API_KEY_SCOPE_VALUES);

export const apiKeySchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  name: z.string(),
  scopes: z.array(apiKeyScopeSchema),
  /** Null means all networks in the organization. */
  networkIds: z.array(z.string().uuid()).nullable(),
  expiresAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export const createApiKeyBody = z
  .object({
    name: z.string().min(1).max(128),
    scopes: z.array(apiKeyScopeSchema).min(1),
    networkIds: z.array(z.string().uuid()).nullable().optional(),
    expiresAt: z.string().datetime().optional(),
  })
  .superRefine((body, ctx) => {
    if (body.networkIds !== undefined && body.networkIds !== null) {
      if (body.networkIds.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Select at least one network or allow all networks",
          path: ["networkIds"],
        });
      }
      const unique = new Set(body.networkIds);
      if (unique.size !== body.networkIds.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate network IDs are not allowed",
          path: ["networkIds"],
        });
      }
    }
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

export function canAccessNetwork(
  apiKey: Pick<ApiKey, "networkIds">,
  networkId: string,
): boolean {
  if (apiKey.networkIds === null) {
    return true;
  }
  return apiKey.networkIds.includes(networkId);
}
