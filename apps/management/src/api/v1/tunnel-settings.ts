import { patchOrganizationTunnelSettingsBody } from "@tuntun/api/management";
import { schema } from "@tuntun/db";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";

import { writeAudit } from "../../lib/audit";
import { db } from "../../lib/db";
import { toIso } from "../../lib/serialize";
import { getAuth, requireAdmin, requireAuth } from "./middleware/authz";
import { notFound, sessionPlugin } from "./middleware/session";

function serializeSettings(
  row: typeof schema.organizationTunnelSettings.$inferSelect,
) {
  return {
    organizationId: row.organizationId,
    defaultRelayId: row.defaultRelayId,
    defaultTtlSeconds: row.defaultTtlSeconds,
    maxTunnelsPerMachine: row.maxTunnelsPerMachine,
    peerDnsSuffix: row.peerDnsSuffix,
    customTunnelDomain: row.customTunnelDomain,
    updatedAt: toIso(row.updatedAt)!,
  };
}

function defaultSettings(organizationId: string) {
  return {
    organizationId,
    defaultRelayId: null,
    defaultTtlSeconds: null,
    maxTunnelsPerMachine: 10,
    peerDnsSuffix: null,
    customTunnelDomain: null,
    updatedAt: new Date().toISOString(),
  };
}

export const tunnelSettingsRoutes = new Elysia()
  .use(sessionPlugin)
  .use(requireAuth)
  .get("/organizations/:orgId/tunnel-settings", async ({ authContext }) => {
    const auth = getAuth({ authContext });
    const row = await db.query.organizationTunnelSettings.findFirst({
      where: eq(
        schema.organizationTunnelSettings.organizationId,
        auth.organizationId,
      ),
    });
    if (!row) {
      return { settings: defaultSettings(auth.organizationId) };
    }
    return { settings: serializeSettings(row) };
  })
  .group("", (app) =>
    app
      .use(requireAdmin)
      .patch(
        "/organizations/:orgId/tunnel-settings",
        async ({ authContext, body }) => {
          const auth = getAuth({ authContext });
          const parsed = patchOrganizationTunnelSettingsBody.parse(body);

          if (parsed.defaultRelayId) {
            const relay = await db.query.relays.findFirst({
              where: and(
                eq(schema.relays.id, parsed.defaultRelayId),
                eq(schema.relays.organizationId, auth.organizationId),
              ),
            });
            if (!relay) return notFound("Relay not found");
          }

          const [row] = await db
            .insert(schema.organizationTunnelSettings)
            .values({
              organizationId: auth.organizationId,
              defaultRelayId: parsed.defaultRelayId ?? null,
              defaultTtlSeconds: parsed.defaultTtlSeconds ?? null,
              maxTunnelsPerMachine: parsed.maxTunnelsPerMachine ?? 10,
              peerDnsSuffix: parsed.peerDnsSuffix ?? null,
              customTunnelDomain: parsed.customTunnelDomain ?? null,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: schema.organizationTunnelSettings.organizationId,
              set: {
                ...(parsed.defaultRelayId !== undefined
                  ? { defaultRelayId: parsed.defaultRelayId }
                  : {}),
                ...(parsed.defaultTtlSeconds !== undefined
                  ? { defaultTtlSeconds: parsed.defaultTtlSeconds }
                  : {}),
                ...(parsed.maxTunnelsPerMachine !== undefined
                  ? { maxTunnelsPerMachine: parsed.maxTunnelsPerMachine }
                  : {}),
                ...(parsed.peerDnsSuffix !== undefined
                  ? { peerDnsSuffix: parsed.peerDnsSuffix }
                  : {}),
                ...(parsed.customTunnelDomain !== undefined
                  ? { customTunnelDomain: parsed.customTunnelDomain }
                  : {}),
                updatedAt: new Date(),
              },
            })
            .returning();

          await writeAudit(db, {
            organizationId: auth.organizationId,
            actor: auth.user.id,
            action: "tunnel_settings.update",
            target: auth.organizationId,
            metadata: parsed,
          });

          return { settings: serializeSettings(row!) };
        },
      ),
  );
