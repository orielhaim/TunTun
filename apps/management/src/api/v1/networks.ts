import { createNetworkBody, patchNetworkBody } from "@tuntun/api/management";
import { formatIpv4Cidr } from "@tuntun/ip";
import { schema } from "@tuntun/db";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";

import { getAuth } from "./middleware/authz";
import { requireAdmin, requireAuth } from "./middleware/authz";
import { notFound, sessionPlugin } from "./middleware/session";
import { writeAudit } from "../../lib/audit";
import { db } from "../../lib/db";
import { bumpNetworkAndNotify } from "../../lib/notify";
import { toIso } from "../../lib/serialize";

function serializeNetwork(row: typeof schema.networks.$inferSelect) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    cidr: formatIpv4Cidr(row.cidr),
    mtu: row.mtu,
    version: row.version,
    createdAt: toIso(row.createdAt)!,
  };
}

export const networksRoutes = new Elysia()
  .use(sessionPlugin)
  .use(requireAuth)
  .get("/organizations/:orgId/networks", async ({ authContext }) => {
    const auth = getAuth({ authContext });
    const rows = await db.query.networks.findMany({
      where: eq(schema.networks.organizationId, auth.organizationId),
    });
    return { networks: rows.map(serializeNetwork) };
  })
  .get(
    "/organizations/:orgId/networks/:networkId",
    async ({ authContext, params }) => {
      const auth = getAuth({ authContext });
      const row = await db.query.networks.findFirst({
        where: and(
          eq(schema.networks.id, params.networkId),
          eq(schema.networks.organizationId, auth.organizationId),
        ),
      });
      if (!row) return notFound("Network not found");
      return serializeNetwork(row);
    },
  )
  .group("", (app) =>
    app
      .use(requireAdmin)
      .post("/organizations/:orgId/networks", async ({ authContext, body }) => {
        const auth = getAuth({ authContext });
        const parsed = createNetworkBody.parse(body);

        const row = await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(schema.networks)
            .values({
              organizationId: auth.organizationId,
              name: parsed.name,
              cidr: formatIpv4Cidr(parsed.cidr),
              mtu: parsed.mtu,
            })
            .returning();

          if (!created) {
            throw new Error("Failed to create network");
          }

          await writeAudit(tx, {
            organizationId: auth.organizationId,
            actor: auth.user.id,
            action: "network.created",
            target: created.id,
            metadata: { name: created.name, cidr: created.cidr },
          });

          await bumpNetworkAndNotify(tx, created.id, auth.organizationId);
          return created;
        });

        return serializeNetwork(row);
      }),
  )
  .group("", (app) =>
    app
      .use(requireAdmin)
      .patch(
        "/organizations/:orgId/networks/:networkId",
        async ({ authContext, params, body }) => {
          const auth = getAuth({ authContext });
          const parsed = patchNetworkBody.parse(body);

          const row = await db.transaction(async (tx) => {
            const [updated] = await tx
              .update(schema.networks)
              .set({
                ...parsed,
                ...(parsed.cidr !== undefined
                  ? { cidr: formatIpv4Cidr(parsed.cidr) }
                  : {}),
              })
              .where(
                and(
                  eq(schema.networks.id, params.networkId),
                  eq(schema.networks.organizationId, auth.organizationId),
                ),
              )
              .returning();

            if (!updated) {
              throw new Error("Network not found");
            }

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "network.updated",
              target: updated.id,
              metadata: parsed,
            });

            await bumpNetworkAndNotify(tx, updated.id, auth.organizationId);
            return updated;
          });

          return serializeNetwork(row);
        },
      ),
  )
  .group("", (app) =>
    app
      .use(requireAdmin)
      .delete(
        "/organizations/:orgId/networks/:networkId",
        async ({ authContext, params }) => {
          const auth = getAuth({ authContext });

          await db.transaction(async (tx) => {
            const [deleted] = await tx
              .delete(schema.networks)
              .where(
                and(
                  eq(schema.networks.id, params.networkId),
                  eq(schema.networks.organizationId, auth.organizationId),
                ),
              )
              .returning({ id: schema.networks.id });

            if (!deleted) {
              throw new Error("Network not found");
            }

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "network.deleted",
              target: deleted.id,
            });

            await bumpNetworkAndNotify(tx, deleted.id, auth.organizationId);
          });

          return { ok: true };
        },
      ),
  );
