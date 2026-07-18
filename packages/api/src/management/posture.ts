import { z } from "zod";

export const postureSourceSchema = z.enum([
  "agent",
  "control",
  "api",
  "integration",
]);

export const postureEnforcementModeSchema = z.enum([
  "monitor",
  "warn",
  "enforce",
]);

export const postureIntegrationProviderSchema = z.enum([
  "crowdstrike",
  "sentinelone",
  "intune",
  "custom",
]);

export const postureValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

export const postureAttributeSchema = z.object({
  id: z.string().uuid(),
  endpointId: z.string(),
  organizationId: z.string(),
  namespace: z.string(),
  key: z.string(),
  value: postureValueSchema,
  collectedAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
  source: postureSourceSchema,
});

export const listDevicePostureResponse = z.object({
  attributes: z.array(postureAttributeSchema),
});

export const patchCustomPostureBody = z.object({
  value: postureValueSchema,
  expiresIn: z.number().int().min(1).optional(),
});

/** Optional `networkId` filter: org-level (`networkId` null) + that network's definitions. */
export const listPostureDefinitionsQuery = z.object({
  networkId: z.string().uuid().optional(),
});

export const postureDefinitionSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  /** Null = organization-level definition. */
  networkId: z.string().uuid().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  assertions: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createPostureDefinitionBody = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(1024).optional(),
  assertions: z.array(z.string().min(1)).min(1),
  /** Omit or null for org-level; set for network-scoped definition. */
  networkId: z.string().uuid().nullable().optional(),
});

export const updatePostureDefinitionBody = z
  .object({
    description: z.string().max(1024).nullable().optional(),
    assertions: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: "At least one field must be provided",
  });

export const postureDefinitionListResponse = z.object({
  postures: z.array(postureDefinitionSchema),
});

export const postureEvalResultSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  failingAssertions: z.array(z.string()),
  score: z.number().int().min(0).max(100).nullable(),
});

export const postureStatusResponse = z.object({
  endpointId: z.string(),
  evaluatedAt: z.string().datetime(),
  postures: z.array(postureEvalResultSchema),
  overallScore: z.number().int().min(0).max(100).nullable(),
});

export const complianceDeviceSummarySchema = z.object({
  endpointId: z.string(),
  name: z.string(),
  passing: z.number().int(),
  failing: z.number().int(),
  total: z.number().int(),
  overallScore: z.number().int().min(0).max(100).nullable(),
});

export const complianceOverviewResponse = z.object({
  organizationId: z.string(),
  totalDevices: z.number().int(),
  compliantDevices: z.number().int(),
  nonCompliantDevices: z.number().int(),
  devices: z.array(complianceDeviceSummarySchema),
});

export const postureIntegrationSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  provider: postureIntegrationProviderSchema,
  config: z.record(z.string(), z.unknown()),
  pollingIntervalSecs: z.number().int().min(60),
  enabled: z.boolean(),
  lastSyncedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createPostureIntegrationBody = z.object({
  provider: postureIntegrationProviderSchema,
  config: z.record(z.string(), z.unknown()).default({}),
  pollingIntervalSecs: z.number().int().min(60).default(300),
  enabled: z.boolean().default(true),
});

export const updatePostureIntegrationBody = z
  .object({
    config: z.record(z.string(), z.unknown()).optional(),
    pollingIntervalSecs: z.number().int().min(60).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: "At least one field must be provided",
  });

export const postureIntegrationListResponse = z.object({
  integrations: z.array(postureIntegrationSchema),
});

export const postureIntegrationSyncResponse = z.object({
  ok: z.boolean(),
  synced: z.number().int(),
});

export const postureScoringWeightSchema = z.object({
  weight: z.number().min(0).max(100),
  failScore: z.number().min(0).max(100),
});

export const postureOrgSettingsSchema = z.object({
  id: z.string().uuid(),
  /** Null = organization default row. */
  networkId: z.string().uuid().nullable(),
  mode: postureEnforcementModeSchema,
  gracePeriodMinutes: z.number().int().min(0),
  recheckOnFailSeconds: z.number().int().min(1),
  notifyUser: z.boolean(),
  notifyAdmin: z.boolean(),
  autoReauthorize: z.boolean(),
  defaultSrcPosture: z.array(z.string()),
  scoringWeights: z.record(z.string(), postureScoringWeightSchema).nullable(),
});

export const postureOrgSettingsFieldsSchema = postureOrgSettingsSchema.omit({
  id: true,
  networkId: true,
});

export const postureOrgSettingsResponse = z.object({
  organizationId: z.string(),
  networkId: z.string().uuid().nullable().optional(),
  settings: postureOrgSettingsFieldsSchema,
  orgSettings: postureOrgSettingsFieldsSchema.optional(),
  networkSettings: postureOrgSettingsFieldsSchema.nullable().optional(),
  updatedAt: z.string().datetime(),
});

export const patchPostureOrgSettingsBody = z
  .object({
    networkId: z.string().uuid().nullable().optional(),
    mode: postureEnforcementModeSchema.optional(),
    gracePeriodMinutes: z.number().int().min(0).optional(),
    recheckOnFailSeconds: z.number().int().min(1).optional(),
    notifyUser: z.boolean().optional(),
    notifyAdmin: z.boolean().optional(),
    autoReauthorize: z.boolean().optional(),
    defaultSrcPosture: z.array(z.string()).optional(),
    scoringWeights: z
      .record(z.string(), postureScoringWeightSchema)
      .nullable()
      .optional(),
  })
  .refine(
    (b) => {
      const { networkId: _networkId, ...rest } = b;
      return Object.keys(rest).length > 0;
    },
    {
      message: "At least one field must be provided",
    },
  );

export const postureWebhookEventSchema = z.enum([
  "posture.failed",
  "posture.passed",
  "posture.changed",
  "posture.recheck",
]);

export const postureWebhookSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  url: z.string().url(),
  events: z.array(postureWebhookEventSchema),
  enabled: z.boolean(),
  secretSet: z.boolean(),
  createdAt: z.string().datetime(),
});

export const createPostureWebhookBody = z.object({
  url: z.string().url(),
  events: z.array(postureWebhookEventSchema).min(1),
  secret: z.string().min(16).max(256).optional(),
  enabled: z.boolean().default(true),
});

export const postureWebhookListResponse = z.object({
  webhooks: z.array(postureWebhookSchema),
});

export const postureRecheckResponse = z.object({
  queued: z.boolean(),
});

export type PostureValue = z.infer<typeof postureValueSchema>;
export type PostureAttribute = z.infer<typeof postureAttributeSchema>;
export type PostureDefinition = z.infer<typeof postureDefinitionSchema>;
export type CreatePostureDefinitionBody = z.infer<
  typeof createPostureDefinitionBody
>;
export type UpdatePostureDefinitionBody = z.infer<
  typeof updatePostureDefinitionBody
>;
export type PostureStatusResponse = z.infer<typeof postureStatusResponse>;
export type ComplianceOverviewResponse = z.infer<
  typeof complianceOverviewResponse
>;
export type PostureIntegration = z.infer<typeof postureIntegrationSchema>;
export type CreatePostureIntegrationBody = z.input<
  typeof createPostureIntegrationBody
>;
export type UpdatePostureIntegrationBody = z.infer<
  typeof updatePostureIntegrationBody
>;
export type PostureOrgSettings = z.infer<typeof postureOrgSettingsSchema>;
export type PostureOrgSettingsFields = z.infer<
  typeof postureOrgSettingsFieldsSchema
>;
export type ListPostureDefinitionsQuery = z.infer<
  typeof listPostureDefinitionsQuery
>;
export type PatchPostureOrgSettingsBody = z.infer<
  typeof patchPostureOrgSettingsBody
>;
export type PostureWebhook = z.infer<typeof postureWebhookSchema>;
export type CreatePostureWebhookBody = z.input<typeof createPostureWebhookBody>;
