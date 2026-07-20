import { z } from "zod";

export const tagDefinitionSchema = z.object({
  name: z.string(),
  owners: z.array(z.string()).default([]),
});

export const hostAliasSchema = z.object({
  name: z.string(),
  target: z.string(),
});

export const ipSetSchema = z.object({
  name: z.string(),
  cidrs: z.array(z.string()).default([]),
});

export const aclRuleSchema = z.object({
  name: z.string(),
  slug: z.string().optional(),
  action: z.string(),
  src: z.array(z.string()).default([]),
  dst: z.array(z.string()).default([]),
  ports: z.array(z.string()).default([]),
  protocol: z.string().optional().nullable(),
  priority: z.number().int().default(0),
  posture: z.array(z.string()).default([]),
  labels: z.record(z.string(), z.string()).default({}),
  enabled: z.boolean().default(true),
});

export const grantSchema = z.object({
  name: z.string(),
  principals: z.array(z.string()).default([]),
  capability: z.string().default(""),
  ports: z.array(z.string()).default([]),
  protocol: z.string().optional().nullable(),
});

export const sshRuleSchema = z.object({
  name: z.string(),
  src: z.array(z.string()).default([]),
  dst: z.array(z.string()).default([]),
  action: z.string(),
  users: z.array(z.string()).default([]),
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true),
});

export const postureDefinitionSchema = z.object({
  name: z.string(),
  assertions: z.array(z.string()).default([]),
});

export const autoApproverSchema = z.object({
  name: z.string(),
  route: z.string().default(""),
  principals: z.array(z.string()).default([]),
});

export const nodeAttributeSchema = z.object({
  name: z.string(),
  value: z.string().default(""),
  selectors: z.array(z.string()).default([]),
});

export const policyTestSchema = z.object({
  name: z.string(),
  src: z.string(),
  accept: z.array(z.string()).default([]),
  deny: z.array(z.string()).default([]),
});

export const policyDocumentSchema = z.object({
  tags: z.array(tagDefinitionSchema).default([]),
  host_aliases: z.array(hostAliasSchema).default([]),
  ip_sets: z.array(ipSetSchema).default([]),
  acls: z.array(aclRuleSchema).default([]),
  grants: z.array(grantSchema).default([]),
  ssh_rules: z.array(sshRuleSchema).default([]),
  postures: z.array(postureDefinitionSchema).default([]),
  auto_approvers: z.array(autoApproverSchema).default([]),
  node_attributes: z.array(nodeAttributeSchema).default([]),
  tests: z.array(policyTestSchema).default([]),
});

export type TagDefinition = z.infer<typeof tagDefinitionSchema>;
export type HostAlias = z.infer<typeof hostAliasSchema>;
export type IpSet = z.infer<typeof ipSetSchema>;
export type AclRule = z.infer<typeof aclRuleSchema>;
export type Grant = z.infer<typeof grantSchema>;
export type SshRule = z.infer<typeof sshRuleSchema>;
export type PostureDefinition = z.infer<typeof postureDefinitionSchema>;
export type AutoApprover = z.infer<typeof autoApproverSchema>;
export type NodeAttribute = z.infer<typeof nodeAttributeSchema>;
export type PolicyTest = z.infer<typeof policyTestSchema>;
export type PolicyDocument = z.infer<typeof policyDocumentSchema>;

export type ValidationIssue = {
  path?: string;
  message: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

export type DiffKind = "add" | "change" | "remove";

export type DiffChange = {
  kind: DiffKind;
  entity: string;
  name: string;
  summary?: string;
};

export type SimulateResult = {
  verdict: "allow" | "deny";
  matchedRules: string[];
};

export type TestCaseResult = {
  name: string;
  passed: boolean;
  message?: string;
};

export type TestResults = {
  passed: number;
  failed: number;
  results: TestCaseResult[];
};

export function aclKey(acl: AclRule): string {
  return acl.slug ?? acl.name;
}

export function emptyDocument(): PolicyDocument {
  return policyDocumentSchema.parse({});
}
