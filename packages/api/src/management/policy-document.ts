import { z } from "zod";

export const policyDocumentFormatSchema = z.enum(["hcl", "json", "yaml"]);

export const policyDocumentInput = z.object({
  path: z.string().min(1),
  format: policyDocumentFormatSchema,
  content: z.string(),
  baseRevision: z.string().optional(),
});

export const policyValidateRequest = z.object({
  documents: z.array(policyDocumentInput).min(1),
  runTests: z.boolean().optional(),
});

export const policyValidateResponse = z.object({
  valid: z.boolean(),
  errors: z
    .array(
      z.object({
        path: z.string().optional(),
        message: z.string(),
      }),
    )
    .optional(),
  warnings: z
    .array(
      z.object({
        path: z.string().optional(),
        message: z.string(),
      }),
    )
    .optional(),
  tests: z
    .object({
      passed: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      results: z
        .array(
          z.object({
            name: z.string(),
            passed: z.boolean(),
            message: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

export const policyDiffChangeSchema = z.object({
  kind: z.enum(["add", "change", "remove"]),
  entity: z.string(),
  name: z.string(),
  summary: z.string().optional(),
});

export const policyDiffRequest = z.object({
  documents: z.array(policyDocumentInput).min(1),
});

export const policyDiffResponse = z.object({
  changes: z.array(policyDiffChangeSchema),
  impact: z
    .object({
      devicesAffected: z.number().int().nonnegative().optional(),
      connectionsBroken: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export const policySimulateScenarioSchema = z.object({
  name: z.string().optional(),
  src: z.string().min(1),
  dst: z.string().min(1),
  port: z.number().int().positive().optional(),
  protocol: z.string().optional(),
});

export const policySimulateRequest = z.object({
  documents: z.array(policyDocumentInput).min(1),
  scenarios: z.array(policySimulateScenarioSchema).min(1),
});

export const policySimulateResponse = z.object({
  scenarios: z.array(
    z.object({
      name: z.string().optional(),
      src: z.string(),
      dst: z.string(),
      port: z.number().int().positive().optional(),
      protocol: z.string().optional(),
      verdict: z.enum(["allow", "deny"]),
      matchedRules: z.array(z.string()).optional(),
      posture: z
        .object({
          passed: z.boolean(),
          details: z.string().optional(),
        })
        .optional(),
    }),
  ),
});

export const policyApplyRequest = z.object({
  documents: z.array(policyDocumentInput).min(1),
  force: z.boolean().optional(),
  baseRevision: z.string().optional(),
});

export const policyApplyResponse = z.object({
  applied: z.boolean(),
  revisionId: z.string().optional(),
  message: z.string().optional(),
});

export const policyDriftRequest = z.object({
  documents: z.array(policyDocumentInput).min(1),
  baseRevision: z.string().optional(),
});

export const policyDriftResponse = z.object({
  hasDrift: z.boolean(),
  liveHash: z.string(),
  changes: z.array(policyDiffChangeSchema),
});

export type PolicyDocumentInput = z.infer<typeof policyDocumentInput>;
export type PolicyValidateRequest = z.infer<typeof policyValidateRequest>;
export type PolicyValidateResponse = z.infer<typeof policyValidateResponse>;
export type PolicyDiffRequest = z.infer<typeof policyDiffRequest>;
export type PolicyDiffResponse = z.infer<typeof policyDiffResponse>;
export type PolicySimulateRequest = z.infer<typeof policySimulateRequest>;
export type PolicySimulateResponse = z.infer<typeof policySimulateResponse>;
export type PolicyApplyRequest = z.infer<typeof policyApplyRequest>;
export type PolicyApplyResponse = z.infer<typeof policyApplyResponse>;
export type PolicyDriftRequest = z.infer<typeof policyDriftRequest>;
export type PolicyDriftResponse = z.infer<typeof policyDriftResponse>;
