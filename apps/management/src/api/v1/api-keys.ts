import { createApiKeyBody } from "@tunnet/api/management";
import { schema } from "@tunnet/db";
import * as argon2 from "argon2";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Elysia } from "elysia";

import { generateApiKeySecret } from "../../lib/api-key-secret";
import { writeAudit } from "../../lib/audit";
import { db } from "../../lib/db";
import { toIso } from "../../lib/serialize";
import { getAuth, requireAuth, requirePermission } from "./middleware/authz";
import { badRequest, sessionPlugin } from "./middleware/session";

function serializeApiKey(row: typeof schema.apiKeys.$inferSelect) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    scopes: row.scopes,
    networkIds: row.networkIds,
    expiresAt: toIso(row.expiresAt),
    revokedAt: toIso(row.revokedAt),
    createdAt: toIso(row.createdAt)!,
  };
}

async function resolveNetworkIds(
  organizationId: string,
  networkIds: string[] | null | undefined,
): Promise<string[] | null> {
  if (networkIds === undefined || networkIds === null) {
    return null;
  }

  const rows = await db.query.networks.findMany({
    where: and(
      eq(schema.networks.organizationId, organizationId),
      inArray(schema.networks.id, networkIds),
    ),
    columns: { id: true },
  });

  if (rows.length !== networkIds.length) {
    throw new Error("One or more networks were not found in this organization");
  }

  return networkIds;
}

export const apiKeysRoutes = new Elysia()
  .use(sessionPlugin)
  .use(requireAuth)
  .get("/organizations/:orgId/api-keys", async ({ authContext }) => {
    const auth = getAuth({ authContext });
    const rows = await db.query.apiKeys.findMany({
      where: and(
        eq(schema.apiKeys.organizationId, auth.organizationId),
        isNull(schema.apiKeys.revokedAt),
      ),
    });
    return { apiKeys: rows.map(serializeApiKey) };
  })
  .group("", (app) =>
    app
      .use(requirePermission({ apiKey: ["create"] }))
      .post("/organizations/:orgId/api-keys", async ({ authContext, body }) => {
        const auth = getAuth({ authContext });
        const parsed = createApiKeyBody.parse(body);
        const { secret, secretPrefix } = generateApiKeySecret();
        const hashedSecret = await argon2.hash(secret);

        let networkIds: string[] | null;
        try {
          networkIds = await resolveNetworkIds(
            auth.organizationId,
            parsed.networkIds ?? null,
          );
        } catch (error) {
          return badRequest(
            error instanceof Error
              ? error.message
              : "Invalid network selection",
          );
        }

        const row = await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(schema.apiKeys)
            .values({
              organizationId: auth.organizationId,
              name: parsed.name,
              secretPrefix,
              hashedSecret,
              scopes: parsed.scopes,
              networkIds,
              expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
            })
            .returning();

          if (!created) {
            throw new Error("Failed to create API key");
          }

          await writeAudit(tx, {
            organizationId: auth.organizationId,
            actor: auth.user.id,
            action: "api_key.created",
            target: created.id,
            metadata: {
              name: created.name,
              scopes: created.scopes,
              networkIds: created.networkIds,
            },
          });

          return created;
        });

        return {
          secret,
          apiKey: serializeApiKey(row),
        };
      }),
  )
  .group("", (app) =>
    app
      .use(requirePermission({ apiKey: ["revoke"] }))
      .delete(
        "/organizations/:orgId/api-keys/:keyId",
        async ({ authContext, params }) => {
          const auth = getAuth({ authContext });

          const row = await db.transaction(async (tx) => {
            const [revoked] = await tx
              .update(schema.apiKeys)
              .set({ revokedAt: new Date() })
              .where(
                and(
                  eq(schema.apiKeys.id, params.keyId),
                  eq(schema.apiKeys.organizationId, auth.organizationId),
                  isNull(schema.apiKeys.revokedAt),
                ),
              )
              .returning();

            if (!revoked) {
              throw new Error("API key not found");
            }

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "api_key.revoked",
              target: revoked.id,
            });

            return revoked;
          });

          return serializeApiKey(row);
        },
      ),
  );
