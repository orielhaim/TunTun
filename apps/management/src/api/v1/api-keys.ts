import { createApiKeyBody } from "@tuntun/api/management";
import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { Elysia } from "elysia";
import * as argon2 from "argon2";

import { schema } from "@tuntun/db";

import { getAuth } from "./middleware/authz";
import { requireAdmin, requireAuth } from "./middleware/authz";
import { sessionPlugin } from "./middleware/session";
import { writeAudit } from "../../lib/audit";
import { db } from "../../lib/db";
import { toIso } from "../../lib/serialize";

function serializeApiKey(row: typeof schema.apiKeys.$inferSelect) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    scopes: row.scopes,
    expiresAt: toIso(row.expiresAt),
    revokedAt: toIso(row.revokedAt),
    createdAt: toIso(row.createdAt)!,
  };
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
      .use(requireAdmin)
      .post("/organizations/:orgId/api-keys", async ({ authContext, body }) => {
        const auth = getAuth({ authContext });
        const parsed = createApiKeyBody.parse(body);
        const secret = randomBytes(32).toString("base64url");
        const hashedSecret = await argon2.hash(secret);

        const row = await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(schema.apiKeys)
            .values({
              organizationId: auth.organizationId,
              name: parsed.name,
              hashedSecret,
              scopes: parsed.scopes,
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
            metadata: { name: created.name },
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
      .use(requireAdmin)
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
