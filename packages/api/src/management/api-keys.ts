import { z } from "zod";

export const API_KEY_SCOPE_VALUES = [
  "sdk:enroll",
  "sdk:manage",
  "policy:read",
  "policy:write",
  "policy:apply",
  "tag:read",
  "tag:write",
  "tag:assign",
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPE_VALUES)[number];

export const SDK_ENROLL_SCOPE: ApiKeyScope = "sdk:enroll";
export const SDK_MANAGE_SCOPE: ApiKeyScope = "sdk:manage";
export const POLICY_READ_SCOPE: ApiKeyScope = "policy:read";
export const POLICY_WRITE_SCOPE: ApiKeyScope = "policy:write";
export const POLICY_APPLY_SCOPE: ApiKeyScope = "policy:apply";
export const TAG_READ_SCOPE: ApiKeyScope = "tag:read";
export const TAG_WRITE_SCOPE: ApiKeyScope = "tag:write";
export const TAG_ASSIGN_SCOPE: ApiKeyScope = "tag:assign";

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
  {
    id: POLICY_READ_SCOPE,
    label: "Read policies",
    description:
      "Export, diff, simulate, history, and list policy entities via API.",
  },
  {
    id: POLICY_WRITE_SCOPE,
    label: "Write policy entities",
    description:
      "Create and update granular policy entities (rules, grants, aliases).",
  },
  {
    id: POLICY_APPLY_SCOPE,
    label: "Apply policy documents",
    description:
      "Apply, force-apply, and rollback policy documents (GitOps / Terraform).",
  },
  {
    id: TAG_READ_SCOPE,
    label: "Read tags",
    description: "List tag definitions and device tag assignments.",
  },
  {
    id: TAG_WRITE_SCOPE,
    label: "Manage tag definitions",
    description: "Create, update, and delete tag definitions and owners.",
  },
  {
    id: TAG_ASSIGN_SCOPE,
    label: "Assign tags",
    description:
      "Assign and remove ACL tags on devices (subject to tag ownership).",
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
