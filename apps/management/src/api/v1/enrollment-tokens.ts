import { randomBytes } from "node:crypto";
import { createEnrollmentTokenBody } from "@tunnet/api/management";
import { schema } from "@tunnet/db";
import { and, eq, isNull } from "drizzle-orm";
import { Elysia } from "elysia";
import { blake3 } from "hash-wasm";
import { writeAudit } from "../../lib/audit";
import { db } from "../../lib/db";
import { toIso } from "../../lib/serialize";
import {
  assertCanAssignTags,
  ensureTagDefinitionsExist,
  normalizeTagName,
} from "../../lib/tag-ownership";
import { getAuth, requireAuth, requirePermission } from "./middleware/authz";
import {
  badRequest,
  forbidden,
  notFound,
  sessionPlugin,
} from "./middleware/session";
import { isOrgAdminRole } from "./middleware/tag-auth";

function serializeToken(row: typeof schema.enrollmentTokens.$inferSelect) {
  return {
    tokenHash: row.tokenHash,
    networkId: row.networkId,
    tags: row.tags ?? [],
    expiresAt: toIso(row.expiresAt)!,
    usedAt: toIso(row.usedAt),
    createdAt: toIso(row.createdAt)!,
  };
}

async function getNetworkInOrg(networkId: string, organizationId: string) {
  return db.query.networks.findFirst({
    where: and(
      eq(schema.networks.id, networkId),
      eq(schema.networks.organizationId, organizationId),
    ),
  });
}

export const enrollmentTokensRoutes = new Elysia()
  .use(sessionPlugin)
  .use(requireAuth)
  .get(
    "/organizations/:orgId/networks/:networkId/enrollment-tokens",
    async ({ authContext, params }) => {
      const auth = getAuth({ authContext });
      const network = await getNetworkInOrg(
        params.networkId,
        auth.organizationId,
      );
      if (!network) return notFound("Network not found");

      const rows = await db.query.enrollmentTokens.findMany({
        where: and(
          eq(schema.enrollmentTokens.networkId, params.networkId),
          isNull(schema.enrollmentTokens.usedAt),
        ),
      });
      return { tokens: rows.map(serializeToken) };
    },
  )
  .group("", (app) =>
    app
      .use(requirePermission({ enrollment: ["create"] }))
      .post(
        "/organizations/:orgId/networks/:networkId/enrollment-tokens",
        async ({ authContext, params, body }) => {
          const auth = getAuth({ authContext });
          const parsed = createEnrollmentTokenBody.parse(body);
          const network = await getNetworkInOrg(
            params.networkId,
            auth.organizationId,
          );
          if (!network) return notFound("Network not found");

          const tags = [
            ...new Set(parsed.tags.map(normalizeTagName).filter(Boolean)),
          ];
          if (tags.length > 0) {
            const missing = await ensureTagDefinitionsExist(
              auth.organizationId,
              tags,
            );
            if (missing.length > 0) {
              return badRequest(
                `Unknown tag definition(s): ${missing.join(", ")}`,
              );
            }
            const ownership = await assertCanAssignTags(
              auth.organizationId,
              tags,
              {
                userId: auth.user.id,
                email: auth.user.email,
                isOrgAdmin: isOrgAdminRole(auth.memberRole),
                endpointId: null,
              },
            );
            if (!ownership.ok) {
              return forbidden();
            }
          }

          const token = randomBytes(32).toString("base64url");
          const tokenHash = await blake3(Buffer.from(token));
          const expiresAt = new Date(Date.now() + parsed.ttlMinutes * 60_000);

          const row = await db.transaction(async (tx) => {
            const [created] = await tx
              .insert(schema.enrollmentTokens)
              .values({
                tokenHash,
                organizationId: auth.organizationId,
                networkId: params.networkId,
                createdBy: auth.user.id,
                tags,
                expiresAt,
              })
              .returning();

            if (!created) {
              throw new Error("Failed to create enrollment token");
            }

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "enrollment_token.created",
              target: created.tokenHash,
              metadata: {
                networkId: params.networkId,
                expiresAt: expiresAt.toISOString(),
                tags,
              },
            });

            return created;
          });

          return {
            token,
            tokenHash,
            expiresAt: toIso(expiresAt)!,
            enrollmentToken: serializeToken(row),
          };
        },
      ),
  )
  .group("", (app) =>
    app
      .use(requirePermission({ enrollment: ["revoke"] }))
      .delete(
        "/organizations/:orgId/networks/:networkId/enrollment-tokens/:tokenHash",
        async ({ authContext, params }) => {
          const auth = getAuth({ authContext });
          const network = await getNetworkInOrg(
            params.networkId,
            auth.organizationId,
          );
          if (!network) return notFound("Network not found");

          await db.transaction(async (tx) => {
            const [deleted] = await tx
              .delete(schema.enrollmentTokens)
              .where(
                and(
                  eq(schema.enrollmentTokens.tokenHash, params.tokenHash),
                  eq(schema.enrollmentTokens.networkId, params.networkId),
                ),
              )
              .returning({ tokenHash: schema.enrollmentTokens.tokenHash });

            if (!deleted) {
              throw new Error("Enrollment token not found");
            }

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "enrollment_token.deleted",
              target: deleted.tokenHash,
            });
          });

          return { ok: true };
        },
      ),
  );
