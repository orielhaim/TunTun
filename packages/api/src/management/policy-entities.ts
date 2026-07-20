import { z } from "zod";

import { selectorSchema } from "./policies";

const tagNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-_]*$/);

const tagOwnerSchema = z
  .string()
  .min(1)
  .max(256)
  .refine(
    (value) =>
      value.startsWith("user:") ||
      value.startsWith("tag:") ||
      value === "autogroup:admin",
    {
      message: "Owner must be user:<id|email>, tag:<name>, or autogroup:admin",
    },
  );

export const tagDefinitionSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  name: z.string(),
  owners: z.array(z.string()),
  machineCount: z.number().int().nonnegative().optional(),
  createdAt: z.string().datetime(),
});

export const createTagDefinitionBody = z.object({
  name: tagNameSchema,
  owners: z.array(tagOwnerSchema).default([]),
});

export const patchTagDefinitionBody = createTagDefinitionBody.partial();

export const deviceTagsSchema = z.object({
  tags: z.array(tagNameSchema),
});

export const patchDeviceTagsBody = z.object({
  add: z.array(tagNameSchema).default([]),
  remove: z.array(tagNameSchema).default([]),
});

export const putDeviceTagsBody = z.object({
  tags: z.array(tagNameSchema),
});

export const bulkAssignDeviceTagsBody = z.object({
  endpointIds: z.array(z.string().length(64)).min(1).max(500),
  add: z.array(tagNameSchema).default([]),
  remove: z.array(tagNameSchema).default([]),
});

export const hostAliasSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  name: z.string(),
  target: z.string(),
  createdAt: z.string().datetime(),
});

export const createHostAliasBody = z.object({
  name: z.string().min(1).max(128),
  target: z.string().min(1),
});

export const ipSetSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  name: z.string(),
  entries: z.array(z.string()),
  createdAt: z.string().datetime(),
});

export const createIpSetBody = z.object({
  name: z.string().min(1).max(128),
  entries: z.array(z.string()).default([]),
});

export const grantSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  networkId: z.string().uuid().nullable().optional(),
  slug: z.string(),
  description: z.string().nullable().optional(),
  srcSelectors: z.array(selectorSchema),
  dstSelectors: z.array(selectorSchema),
  ipRules: z.array(z.unknown()),
  appCapabilities: z.array(z.unknown()),
  priority: z.number().int(),
  enabled: z.boolean(),
  createdAt: z.string().datetime(),
});

export const createGrantBody = z.object({
  slug: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  networkId: z.string().uuid().optional(),
  description: z.string().optional(),
  srcSelectors: z.array(selectorSchema).default([]),
  dstSelectors: z.array(selectorSchema).default([]),
  ipRules: z.array(z.unknown()).default([]),
  appCapabilities: z.array(z.unknown()).default([]),
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true),
});

export const autoApproverSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  networkId: z.string().uuid().nullable().optional(),
  slug: z.string(),
  routes: z.record(z.string(), z.array(z.string())),
  exitNodes: z.array(z.string()),
  createdAt: z.string().datetime(),
});

export const createAutoApproverBody = z.object({
  slug: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  networkId: z.string().uuid().optional(),
  routes: z.record(z.string(), z.array(z.string())).default({}),
  exitNodes: z.array(z.string()).default([]),
});

export const patchHostAliasBody = createHostAliasBody.partial();
export const patchIpSetBody = createIpSetBody.partial();
export const patchGrantBody = createGrantBody.partial();
export const patchAutoApproverBody = createAutoApproverBody.partial();

export const policyRevisionSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  networkId: z.string().uuid().nullable().optional(),
  version: z.number().int(),
  contentHash: z.string(),
  source: z.enum(["dashboard", "api", "gitops", "terraform"]),
  authorUserId: z.string().nullable().optional(),
  authorApiKeyId: z.string().uuid().nullable().optional(),
  createdAt: z.string().datetime(),
});

export const tagDefinitionListResponse = z.object({
  tags: z.array(tagDefinitionSchema),
});

export const policyHistoryResponse = z.object({
  revisions: z.array(policyRevisionSchema),
});

export type TagDefinition = z.infer<typeof tagDefinitionSchema>;
export type HostAlias = z.infer<typeof hostAliasSchema>;
export type IpSet = z.infer<typeof ipSetSchema>;
export type Grant = z.infer<typeof grantSchema>;
export type AutoApprover = z.infer<typeof autoApproverSchema>;
export type PolicyRevision = z.infer<typeof policyRevisionSchema>;
export type CreateTagDefinitionBody = z.infer<typeof createTagDefinitionBody>;
export type PatchTagDefinitionBody = z.infer<typeof patchTagDefinitionBody>;
export type PatchDeviceTagsBody = z.infer<typeof patchDeviceTagsBody>;
export type PutDeviceTagsBody = z.infer<typeof putDeviceTagsBody>;
export type BulkAssignDeviceTagsBody = z.infer<typeof bulkAssignDeviceTagsBody>;
