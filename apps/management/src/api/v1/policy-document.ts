import {
  policyApplyRequest,
  policyDiffRequest,
  policyDriftRequest,
  policySimulateRequest,
  policyValidateRequest,
} from "@tunnet/api/management";
import { schema } from "@tunnet/db";
import {
  contentHash,
  diffDocuments,
  exportDocument,
  type PolicyDocument,
  runTests,
  simulateDocument,
  validateDocument,
} from "@tunnet/policy-engine";
import { desc, eq } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { z } from "zod";

import { db } from "../../lib/db";
import {
  applyPolicyDocument,
  loadOrganizationPolicyDocument,
  parsePolicyDocuments,
} from "../../lib/policy-ir";
import {
  getPolicyActor,
  policyAuthPlugin,
  requirePolicyAccess,
} from "./middleware/policy-auth";
import { conflict } from "./middleware/session";

const policyRollbackBody = z.object({
  revisionId: z.string().uuid(),
});

export const policyDocumentRoutes = new Elysia()
  .use(policyAuthPlugin)
  .group("", (app) =>
    app
      .use(requirePolicyAccess("read"))
      .post("/organizations/:orgId/policy/validate", async ({ body }) => {
        const parsed = policyValidateRequest.parse(body);
        const document = parsePolicyDocuments(parsed.documents);
        const validation = validateDocument(document);
        const response: {
          valid: boolean;
          errors?: Array<{ path?: string; message: string }>;
          warnings?: Array<{ path?: string; message: string }>;
          tests?: {
            passed: number;
            failed: number;
            results: Array<{
              name: string;
              passed: boolean;
              message?: string;
            }>;
          };
        } = {
          valid: validation.valid,
          errors: validation.errors,
          warnings: validation.warnings,
        };
        if (parsed.runTests) {
          const tests = runTests(document);
          response.tests = tests;
          response.valid = validation.valid && tests.failed === 0;
        }
        return response;
      })
      .post("/organizations/:orgId/policy/diff", async ({ params, body }) => {
        const parsed = policyDiffRequest.parse(body);
        const desired = parsePolicyDocuments(parsed.documents);
        const live = await loadOrganizationPolicyDocument(params.orgId);
        return { changes: diffDocuments(live, desired) };
      })
      .post("/organizations/:orgId/policy/simulate", async ({ body }) => {
        const parsed = policySimulateRequest.parse(body);
        const document = parsePolicyDocuments(parsed.documents);
        return {
          scenarios: parsed.scenarios.map((scenario) => {
            const result = simulateDocument(document, {
              src: scenario.src,
              dst: scenario.dst,
              port: scenario.port,
              protocol: scenario.protocol,
            });
            return {
              name: scenario.name,
              src: scenario.src,
              dst: scenario.dst,
              port: scenario.port,
              protocol: scenario.protocol,
              verdict: result.verdict,
              matchedRules: result.matchedRules,
            };
          }),
        };
      })
      .get(
        "/organizations/:orgId/policy/export",
        async ({ params, query }) => {
          const format = (query.format ?? "json") as "json" | "hcl" | "yaml";
          const document = await loadOrganizationPolicyDocument(params.orgId);
          const content = exportDocument(document, format);
          return new Response(content, {
            headers: {
              "Content-Type":
                format === "json"
                  ? "application/json"
                  : format === "yaml"
                    ? "text/yaml"
                    : "text/plain",
            },
          });
        },
        {
          query: t.Object({
            format: t.Optional(
              t.Union([t.Literal("json"), t.Literal("hcl"), t.Literal("yaml")]),
            ),
          }),
        },
      )
      .get("/organizations/:orgId/policy/history", async ({ params }) => {
        const revisions = await db.query.policyRevisions.findMany({
          where: eq(schema.policyRevisions.organizationId, params.orgId),
          orderBy: [desc(schema.policyRevisions.createdAt)],
          limit: 100,
        });
        return {
          revisions: revisions.map((revision) => ({
            id: revision.id,
            organizationId: revision.organizationId,
            networkId: revision.networkId,
            version: revision.version,
            contentHash: revision.contentHash,
            source: revision.source,
            authorUserId: revision.authorUserId,
            authorApiKeyId: revision.authorApiKeyId,
            createdAt: revision.createdAt.toISOString(),
          })),
        };
      })
      .post("/organizations/:orgId/policy/drift", async ({ params, body }) => {
        const parsed = policyDriftRequest.parse(body);
        const desired = parsePolicyDocuments(parsed.documents);
        const live = await loadOrganizationPolicyDocument(params.orgId);
        const liveHash = await contentHash(live);
        const baseRevision =
          parsed.baseRevision ??
          parsed.documents.find((doc) => doc.baseRevision)?.baseRevision;
        const hasDrift =
          Boolean(baseRevision && baseRevision !== liveHash) ||
          diffDocuments(live, desired).length > 0;
        return {
          hasDrift,
          liveHash,
          changes: diffDocuments(live, desired),
        };
      }),
  )
  .group("", (app) =>
    app
      .use(requirePolicyAccess("apply"))
      .post(
        "/organizations/:orgId/policy/apply",
        async ({ params, body, authContext, apiKeyAuth, set }) => {
          const parsed = policyApplyRequest.parse(body);
          const actor = getPolicyActor({ authContext, apiKeyAuth });
          const document = parsePolicyDocuments(parsed.documents);
          const validation = validateDocument(document);
          if (!validation.valid) {
            set.status = 400;
            return {
              error: "Policy document validation failed",
              errors: validation.errors,
            };
          }

          const live = await loadOrganizationPolicyDocument(params.orgId);
          const liveHash = await contentHash(live);
          const baseRevision =
            parsed.baseRevision ??
            parsed.documents.find((doc) => doc.baseRevision)?.baseRevision;

          if (!parsed.force && baseRevision && baseRevision !== liveHash) {
            return conflict(
              `Policy drift detected: live hash ${liveHash} does not match base revision ${baseRevision}`,
            );
          }

          const hash = await contentHash(document);
          const source = actor.apiKeyId ? "api" : "dashboard";
          const result = await applyPolicyDocument({
            organizationId: params.orgId,
            document,
            source,
            userId: actor.userId,
            apiKeyId: actor.apiKeyId,
            contentHash: hash,
          });

          return {
            applied: true,
            revisionId: result.revisionId,
            message: "Policy applied",
          };
        },
      )
      .post(
        "/organizations/:orgId/policy/rollback",
        async ({ params, body, authContext, apiKeyAuth, set }) => {
          const parsed = policyRollbackBody.parse(body);
          const actor = getPolicyActor({ authContext, apiKeyAuth });
          const revision = await db.query.policyRevisions.findFirst({
            where: eq(schema.policyRevisions.id, parsed.revisionId),
          });
          if (!revision || revision.organizationId !== params.orgId) {
            set.status = 404;
            return { error: "Policy revision not found" };
          }
          const snapshot = revision.irSnapshot as PolicyDocument | null;
          if (!snapshot) {
            set.status = 400;
            return { error: "Revision has no stored policy snapshot" };
          }
          const source = actor.apiKeyId ? "api" : "dashboard";
          const result = await applyPolicyDocument({
            organizationId: params.orgId,
            document: snapshot,
            source,
            userId: actor.userId,
            apiKeyId: actor.apiKeyId,
            contentHash: revision.contentHash,
          });
          return {
            applied: true,
            revisionId: result.revisionId,
            message: `Rolled back to revision ${revision.version}`,
          };
        },
      ),
  );
