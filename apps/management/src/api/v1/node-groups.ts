import {
  createNodeGroupBody,
  patchNodeGroupBody,
} from "@tunnet/api/management";
import { schema } from "@tunnet/db";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { writeAudit } from "../../lib/audit";
import { db } from "../../lib/db";
import { bumpNetworkAndNotify } from "../../lib/notify";
import { toIso } from "../../lib/serialize";
import { getAuth, requireAdmin, requireAuth } from "./middleware/authz";
import { notFound, sessionPlugin } from "./middleware/session";

async function getNetworkInOrg(networkId: string, organizationId: string) {
  return db.query.networks.findFirst({
    where: and(
      eq(schema.networks.id, networkId),
      eq(schema.networks.organizationId, organizationId),
    ),
  });
}

export const nodeGroupsRoutes = new Elysia()
  .use(sessionPlugin)
  .use(requireAuth)
  .get(
    "/organizations/:orgId/networks/:networkId/node-groups",
    async ({ authContext, params }) => {
      const auth = getAuth({ authContext });
      const network = await getNetworkInOrg(
        params.networkId,
        auth.organizationId,
      );
      if (!network) return notFound("Network not found");

      const groups = await db.query.nodeGroups.findMany({
        where: eq(schema.nodeGroups.networkId, params.networkId),
        with: { members: true },
      });

      return {
        groups: groups.map((g) => ({
          id: g.id,
          networkId: g.networkId,
          name: g.name,
          haEnabled: g.haEnabled,
          activeEndpointId: g.activeEndpointId,
          createdAt: toIso(g.createdAt)!,
          members: g.members.map((m) => ({
            endpointId: m.endpointId,
            priority: m.priority,
            joinedAt: toIso(m.joinedAt)!,
          })),
        })),
      };
    },
  )
  .group("", (app) =>
    app
      .use(requireAdmin)
      .post(
        "/organizations/:orgId/networks/:networkId/node-groups",
        async ({ authContext, params, body, set }) => {
          const auth = getAuth({ authContext });
          const parsed = createNodeGroupBody.parse(body);
          const network = await getNetworkInOrg(
            params.networkId,
            auth.organizationId,
          );
          if (!network) return notFound("Network not found");

          for (const member of parsed.members) {
            const membership = await db.query.networkMemberships.findFirst({
              where: and(
                eq(schema.networkMemberships.endpointId, member.endpointId),
                eq(schema.networkMemberships.networkId, params.networkId),
              ),
            });
            if (!membership) {
              set.status = 400;
              return {
                error: `Device ${member.endpointId.slice(0, 8)}… is not in this network`,
              };
            }
          }

          const created = await db.transaction(async (tx) => {
            const [group] = await tx
              .insert(schema.nodeGroups)
              .values({
                networkId: params.networkId,
                name: parsed.name,
                haEnabled: parsed.haEnabled,
                activeEndpointId: parsed.members[0]?.endpointId ?? null,
              })
              .returning();
            if (!group) throw new Error("Failed to create node group");

            await tx.insert(schema.nodeGroupMembers).values(
              parsed.members.map((m) => ({
                groupId: group.id,
                endpointId: m.endpointId,
                priority: m.priority,
              })),
            );

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "node_group.created",
              target: group.id,
              metadata: { name: parsed.name, members: parsed.members.length },
            });
            await bumpNetworkAndNotify(
              tx,
              params.networkId,
              auth.organizationId,
            );
            return group;
          });

          return {
            id: created.id,
            networkId: created.networkId,
            name: created.name,
            haEnabled: created.haEnabled,
            activeEndpointId: created.activeEndpointId,
            createdAt: toIso(created.createdAt)!,
          };
        },
      )
      .patch(
        "/organizations/:orgId/networks/:networkId/node-groups/:groupId",
        async ({ authContext, params, body }) => {
          const auth = getAuth({ authContext });
          const parsed = patchNodeGroupBody.parse(body);
          const network = await getNetworkInOrg(
            params.networkId,
            auth.organizationId,
          );
          if (!network) return notFound("Network not found");

          const updated = await db.transaction(async (tx) => {
            const [row] = await tx
              .update(schema.nodeGroups)
              .set({
                ...(parsed.name !== undefined ? { name: parsed.name } : {}),
                ...(parsed.haEnabled !== undefined
                  ? { haEnabled: parsed.haEnabled }
                  : {}),
                ...(parsed.activeEndpointId !== undefined
                  ? { activeEndpointId: parsed.activeEndpointId }
                  : {}),
              })
              .where(
                and(
                  eq(schema.nodeGroups.id, params.groupId),
                  eq(schema.nodeGroups.networkId, params.networkId),
                ),
              )
              .returning();
            if (!row) return null;
            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "node_group.updated",
              target: row.id,
              metadata: parsed,
            });
            await bumpNetworkAndNotify(
              tx,
              params.networkId,
              auth.organizationId,
            );
            return row;
          });

          if (!updated) return notFound("Node group not found");
          return {
            id: updated.id,
            networkId: updated.networkId,
            name: updated.name,
            haEnabled: updated.haEnabled,
            activeEndpointId: updated.activeEndpointId,
            createdAt: toIso(updated.createdAt)!,
          };
        },
      )
      .delete(
        "/organizations/:orgId/networks/:networkId/node-groups/:groupId",
        async ({ authContext, params }) => {
          const auth = getAuth({ authContext });
          const network = await getNetworkInOrg(
            params.networkId,
            auth.organizationId,
          );
          if (!network) return notFound("Network not found");

          const deleted = await db.transaction(async (tx) => {
            const [row] = await tx
              .delete(schema.nodeGroups)
              .where(
                and(
                  eq(schema.nodeGroups.id, params.groupId),
                  eq(schema.nodeGroups.networkId, params.networkId),
                ),
              )
              .returning();
            if (!row) return null;
            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "node_group.deleted",
              target: row.id,
              metadata: { name: row.name },
            });
            await bumpNetworkAndNotify(
              tx,
              params.networkId,
              auth.organizationId,
            );
            return row;
          });

          if (!deleted) return notFound("Node group not found");
          return { ok: true as const };
        },
      ),
  );
