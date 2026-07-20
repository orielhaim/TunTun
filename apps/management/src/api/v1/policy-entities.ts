import {
  createAutoApproverBody,
  createGrantBody,
  createHostAliasBody,
  createIpSetBody,
  createTagDefinitionBody,
  patchGrantBody,
  patchHostAliasBody,
  patchIpSetBody,
  patchTagDefinitionBody,
} from "@tunnet/api/management";
import { schema } from "@tunnet/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Elysia } from "elysia";

import { writeAudit } from "../../lib/audit";
import { db } from "../../lib/db";
import { bumpOrgAndNotify } from "../../lib/notify";
import { toIso } from "../../lib/serialize";
import { defaultOwnerForUser, normalizeTagName } from "../../lib/tag-ownership";
import {
  getPolicyActor,
  policyAuthPlugin,
  requirePolicyAccess,
} from "./middleware/policy-auth";
import { badRequest, notFound } from "./middleware/session";
import { getTagActor, requireTagAccess } from "./middleware/tag-auth";

async function notifyPolicyChange(
  tx: Parameters<typeof writeAudit>[0],
  organizationId: string,
  actor: string,
  action: string,
  target: string,
) {
  await writeAudit(tx, {
    organizationId,
    actor,
    action,
    target,
  });
  await bumpOrgAndNotify(tx, organizationId);
}

export const policyEntitiesRoutes = new Elysia()
  .use(policyAuthPlugin)
  .group("", (app) =>
    app
      .use(requireTagAccess("read"))
      .get("/organizations/:orgId/tag-definitions", async ({ params }) => {
        const rows = await db.query.tagDefinitions.findMany({
          where: eq(schema.tagDefinitions.organizationId, params.orgId),
        });
        const counts = await db
          .select({
            tag: schema.deviceTags.tag,
            count: sql<number>`count(*)::int`,
          })
          .from(schema.deviceTags)
          .innerJoin(
            schema.devices,
            eq(schema.deviceTags.endpointId, schema.devices.endpointId),
          )
          .where(eq(schema.devices.organizationId, params.orgId))
          .groupBy(schema.deviceTags.tag);
        const countByTag = new Map(counts.map((c) => [c.tag, c.count]));
        return {
          tags: rows.map((row) => ({
            id: row.id,
            organizationId: row.organizationId,
            name: row.name,
            owners: row.owners,
            machineCount: countByTag.get(row.name) ?? 0,
            createdAt: toIso(row.createdAt)!,
          })),
        };
      }),
  )
  .group("", (app) =>
    app
      .use(requireTagAccess("write"))
      .post(
        "/organizations/:orgId/tag-definitions",
        async ({ params, body, authContext, apiKeyAuth }) => {
          const actor = getTagActor({ authContext, apiKeyAuth });
          const parsed = createTagDefinitionBody.parse(body);
          const name = normalizeTagName(parsed.name);
          let owners = parsed.owners.map((o) =>
            o.startsWith("tag:") ? `tag:${normalizeTagName(o.slice(4))}` : o,
          );
          if (owners.length === 0) {
            if (actor.userId) {
              owners = [defaultOwnerForUser(actor.userId)];
            } else {
              return badRequest("Tag definition requires at least one owner");
            }
          }
          const [created] = await db.transaction(async (tx) => {
            const [row] = await tx
              .insert(schema.tagDefinitions)
              .values({
                organizationId: params.orgId,
                name,
                owners,
              })
              .returning();
            if (!row) throw new Error("Failed to create tag definition");
            await notifyPolicyChange(
              tx,
              params.orgId,
              actor.userId ?? actor.apiKeyId ?? "system",
              "tag_definition.created",
              row.id,
            );
            return [row] as const;
          });
          if (!created) throw new Error("Failed to create tag definition");
          return {
            id: created.id,
            name: created.name,
            owners: created.owners,
            createdAt: toIso(created.createdAt)!,
          };
        },
      )
      .patch(
        "/organizations/:orgId/tag-definitions/:id",
        async ({ params, body, authContext, apiKeyAuth, set }) => {
          const actor = getTagActor({ authContext, apiKeyAuth });
          const parsed = patchTagDefinitionBody.parse(body);
          if (parsed.owners !== undefined && parsed.owners.length === 0) {
            return badRequest("Tag definition requires at least one owner");
          }
          const updated = await db.transaction(async (tx) => {
            const [row] = await tx
              .update(schema.tagDefinitions)
              .set({
                ...(parsed.name !== undefined
                  ? { name: normalizeTagName(parsed.name) }
                  : {}),
                ...(parsed.owners !== undefined
                  ? {
                      owners: parsed.owners.map((o) =>
                        o.startsWith("tag:")
                          ? `tag:${normalizeTagName(o.slice(4))}`
                          : o,
                      ),
                    }
                  : {}),
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(schema.tagDefinitions.id, params.id),
                  eq(schema.tagDefinitions.organizationId, params.orgId),
                ),
              )
              .returning();
            if (!row) return null;
            await notifyPolicyChange(
              tx,
              params.orgId,
              actor.userId ?? actor.apiKeyId ?? "system",
              "tag_definition.updated",
              row.id,
            );
            return row;
          });
          if (!updated) {
            set.status = 404;
            return { error: "Tag definition not found" };
          }
          return {
            id: updated.id,
            name: updated.name,
            owners: updated.owners,
          };
        },
      )
      .delete(
        "/organizations/:orgId/tag-definitions/:id",
        async ({ params, authContext, apiKeyAuth, set }) => {
          const actor = getTagActor({ authContext, apiKeyAuth });
          const deleted = await db.transaction(async (tx) => {
            const [row] = await tx
              .delete(schema.tagDefinitions)
              .where(
                and(
                  eq(schema.tagDefinitions.id, params.id),
                  eq(schema.tagDefinitions.organizationId, params.orgId),
                ),
              )
              .returning();
            if (!row) return null;
            await notifyPolicyChange(
              tx,
              params.orgId,
              actor.userId ?? actor.apiKeyId ?? "system",
              "tag_definition.deleted",
              row.id,
            );
            return row;
          });
          if (!deleted) {
            set.status = 404;
            return { error: "Tag definition not found" };
          }
          return { deleted: true };
        },
      ),
  )
  .group("", (app) =>
    app
      .use(requirePolicyAccess("read"))
      .get("/organizations/:orgId/host-aliases", async ({ params }) => {
        const rows = await db.query.hostAliases.findMany({
          where: eq(schema.hostAliases.organizationId, params.orgId),
        });
        return {
          hostAliases: rows.map((row) => ({
            id: row.id,
            organizationId: row.organizationId,
            name: row.name,
            target: row.target,
            createdAt: toIso(row.createdAt)!,
          })),
        };
      }),
  )
  .group("", (app) =>
    app
      .use(requirePolicyAccess("write"))
      .post(
        "/organizations/:orgId/host-aliases",
        async ({ params, body, authContext, apiKeyAuth }) => {
          const actor = getPolicyActor({ authContext, apiKeyAuth });
          const parsed = createHostAliasBody.parse(body);
          const created = await db.transaction(async (tx) => {
            const [row] = await tx
              .insert(schema.hostAliases)
              .values({
                organizationId: params.orgId,
                name: parsed.name,
                target: parsed.target,
              })
              .returning();
            if (!row) throw new Error("Failed to create host alias");
            await notifyPolicyChange(
              tx,
              params.orgId,
              actor.userId ?? actor.apiKeyId ?? "system",
              "host_alias.created",
              row.id,
            );
            return row;
          });
          return {
            id: created.id,
            name: created.name,
            createdAt: toIso(created.createdAt)!,
          };
        },
      )
      .patch(
        "/organizations/:orgId/host-aliases/:id",
        async ({ params, body, authContext, apiKeyAuth, set }) => {
          const actor = getPolicyActor({ authContext, apiKeyAuth });
          const parsed = patchHostAliasBody.parse(body);
          const updated = await db.transaction(async (tx) => {
            const [row] = await tx
              .update(schema.hostAliases)
              .set(parsed)
              .where(
                and(
                  eq(schema.hostAliases.id, params.id),
                  eq(schema.hostAliases.organizationId, params.orgId),
                ),
              )
              .returning();
            if (!row) return null;
            await notifyPolicyChange(
              tx,
              params.orgId,
              actor.userId ?? actor.apiKeyId ?? "system",
              "host_alias.updated",
              row.id,
            );
            return row;
          });
          if (!updated) {
            set.status = 404;
            return { error: "Host alias not found" };
          }
          return { id: updated.id, name: updated.name, target: updated.target };
        },
      )
      .delete(
        "/organizations/:orgId/host-aliases/:id",
        async ({ params, authContext, apiKeyAuth, set }) => {
          const actor = getPolicyActor({ authContext, apiKeyAuth });
          const deleted = await db.transaction(async (tx) => {
            const [row] = await tx
              .delete(schema.hostAliases)
              .where(
                and(
                  eq(schema.hostAliases.id, params.id),
                  eq(schema.hostAliases.organizationId, params.orgId),
                ),
              )
              .returning();
            if (!row) return null;
            await notifyPolicyChange(
              tx,
              params.orgId,
              actor.userId ?? actor.apiKeyId ?? "system",
              "host_alias.deleted",
              row.id,
            );
            return row;
          });
          if (!deleted) {
            set.status = 404;
            return { error: "Host alias not found" };
          }
          return { deleted: true };
        },
      ),
  )
  .group("", (app) =>
    app
      .use(requirePolicyAccess("read"))
      .get("/organizations/:orgId/ip-sets", async ({ params }) => {
        const rows = await db.query.ipSets.findMany({
          where: eq(schema.ipSets.organizationId, params.orgId),
        });
        return {
          ipSets: rows.map((row) => ({
            id: row.id,
            organizationId: row.organizationId,
            name: row.name,
            entries: row.entries,
            createdAt: toIso(row.createdAt)!,
          })),
        };
      }),
  )
  .group("", (app) =>
    app
      .use(requirePolicyAccess("write"))
      .post(
        "/organizations/:orgId/ip-sets",
        async ({ params, body, authContext, apiKeyAuth }) => {
          const actor = getPolicyActor({ authContext, apiKeyAuth });
          const parsed = createIpSetBody.parse(body);
          const created = await db.transaction(async (tx) => {
            const [row] = await tx
              .insert(schema.ipSets)
              .values({
                organizationId: params.orgId,
                name: parsed.name,
                entries: parsed.entries,
              })
              .returning();
            if (!row) throw new Error("Failed to create IP set");
            await notifyPolicyChange(
              tx,
              params.orgId,
              actor.userId ?? actor.apiKeyId ?? "system",
              "ip_set.created",
              row.id,
            );
            return row;
          });
          return {
            id: created.id,
            name: created.name,
            createdAt: toIso(created.createdAt)!,
          };
        },
      )
      .patch(
        "/organizations/:orgId/ip-sets/:id",
        async ({ params, body, authContext, apiKeyAuth, set }) => {
          const actor = getPolicyActor({ authContext, apiKeyAuth });
          const parsed = patchIpSetBody.parse(body);
          const updated = await db.transaction(async (tx) => {
            const [row] = await tx
              .update(schema.ipSets)
              .set(parsed)
              .where(
                and(
                  eq(schema.ipSets.id, params.id),
                  eq(schema.ipSets.organizationId, params.orgId),
                ),
              )
              .returning();
            if (!row) return null;
            await notifyPolicyChange(
              tx,
              params.orgId,
              actor.userId ?? actor.apiKeyId ?? "system",
              "ip_set.updated",
              row.id,
            );
            return row;
          });
          if (!updated) {
            set.status = 404;
            return { error: "IP set not found" };
          }
          return { id: updated.id, name: updated.name };
        },
      )
      .delete(
        "/organizations/:orgId/ip-sets/:id",
        async ({ params, authContext, apiKeyAuth, set }) => {
          const actor = getPolicyActor({ authContext, apiKeyAuth });
          const deleted = await db.transaction(async (tx) => {
            const [row] = await tx
              .delete(schema.ipSets)
              .where(
                and(
                  eq(schema.ipSets.id, params.id),
                  eq(schema.ipSets.organizationId, params.orgId),
                ),
              )
              .returning();
            if (!row) return null;
            await notifyPolicyChange(
              tx,
              params.orgId,
              actor.userId ?? actor.apiKeyId ?? "system",
              "ip_set.deleted",
              row.id,
            );
            return row;
          });
          if (!deleted) {
            set.status = 404;
            return { error: "IP set not found" };
          }
          return { deleted: true };
        },
      ),
  )
  .group("", (app) =>
    app
      .use(requirePolicyAccess("read"))
      .get("/organizations/:orgId/grants", async ({ params }) => {
        const rows = await db.query.grants.findMany({
          where: eq(schema.grants.organizationId, params.orgId),
        });
        return {
          grants: rows.map((row) => ({
            id: row.id,
            organizationId: row.organizationId,
            networkId: row.networkId,
            slug: row.slug,
            description: row.description,
            srcSelectors: row.srcSelectors,
            dstSelectors: row.dstSelectors,
            ipRules: row.ipRules,
            appCapabilities: row.appCapabilities,
            priority: row.priority,
            enabled: row.enabled,
            createdAt: toIso(row.createdAt)!,
          })),
        };
      }),
  )
  .group("", (app) =>
    app
      .use(requirePolicyAccess("write"))
      .post(
        "/organizations/:orgId/grants",
        async ({ params, body, authContext, apiKeyAuth }) => {
          const actor = getPolicyActor({ authContext, apiKeyAuth });
          const parsed = createGrantBody.parse(body);
          const created = await db.transaction(async (tx) => {
            const [row] = await tx
              .insert(schema.grants)
              .values({
                organizationId: params.orgId,
                networkId: parsed.networkId ?? null,
                slug: parsed.slug,
                description: parsed.description ?? null,
                srcSelectors: parsed.srcSelectors,
                dstSelectors: parsed.dstSelectors,
                ipRules: parsed.ipRules,
                appCapabilities: parsed.appCapabilities,
                priority: parsed.priority,
                enabled: parsed.enabled,
              })
              .returning();
            if (!row) throw new Error("Failed to create grant");
            await notifyPolicyChange(
              tx,
              params.orgId,
              actor.userId ?? actor.apiKeyId ?? "system",
              "grant.created",
              row.id,
            );
            return row;
          });
          return {
            id: created.id,
            slug: created.slug,
            createdAt: toIso(created.createdAt)!,
          };
        },
      )
      .patch(
        "/organizations/:orgId/grants/:id",
        async ({ params, body, authContext, apiKeyAuth, set }) => {
          const actor = getPolicyActor({ authContext, apiKeyAuth });
          const parsed = patchGrantBody.parse(body);
          const updated = await db.transaction(async (tx) => {
            const [row] = await tx
              .update(schema.grants)
              .set({
                ...(parsed.networkId !== undefined
                  ? { networkId: parsed.networkId ?? null }
                  : {}),
                ...(parsed.slug !== undefined ? { slug: parsed.slug } : {}),
                ...(parsed.description !== undefined
                  ? { description: parsed.description }
                  : {}),
                ...(parsed.srcSelectors !== undefined
                  ? { srcSelectors: parsed.srcSelectors }
                  : {}),
                ...(parsed.dstSelectors !== undefined
                  ? { dstSelectors: parsed.dstSelectors }
                  : {}),
                ...(parsed.ipRules !== undefined
                  ? { ipRules: parsed.ipRules }
                  : {}),
                ...(parsed.appCapabilities !== undefined
                  ? { appCapabilities: parsed.appCapabilities }
                  : {}),
                ...(parsed.priority !== undefined
                  ? { priority: parsed.priority }
                  : {}),
                ...(parsed.enabled !== undefined
                  ? { enabled: parsed.enabled }
                  : {}),
              })
              .where(
                and(
                  eq(schema.grants.id, params.id),
                  eq(schema.grants.organizationId, params.orgId),
                ),
              )
              .returning();
            if (!row) return null;
            await notifyPolicyChange(
              tx,
              params.orgId,
              actor.userId ?? actor.apiKeyId ?? "system",
              "grant.updated",
              row.id,
            );
            return row;
          });
          if (!updated) {
            set.status = 404;
            return { error: "Grant not found" };
          }
          return { id: updated.id, slug: updated.slug };
        },
      )
      .delete(
        "/organizations/:orgId/grants/:id",
        async ({ params, authContext, apiKeyAuth, set }) => {
          const actor = getPolicyActor({ authContext, apiKeyAuth });
          const deleted = await db.transaction(async (tx) => {
            const [row] = await tx
              .delete(schema.grants)
              .where(
                and(
                  eq(schema.grants.id, params.id),
                  eq(schema.grants.organizationId, params.orgId),
                ),
              )
              .returning();
            if (!row) return null;
            await notifyPolicyChange(
              tx,
              params.orgId,
              actor.userId ?? actor.apiKeyId ?? "system",
              "grant.deleted",
              row.id,
            );
            return row;
          });
          if (!deleted) {
            set.status = 404;
            return { error: "Grant not found" };
          }
          return { deleted: true };
        },
      ),
  )
  .group("", (app) =>
    app
      .use(requirePolicyAccess("read"))
      .get("/organizations/:orgId/auto-approvers", async ({ params }) => {
        const rows = await db.query.autoApprovers.findMany({
          where: eq(schema.autoApprovers.organizationId, params.orgId),
        });
        return {
          autoApprovers: rows.map((row) => ({
            id: row.id,
            organizationId: row.organizationId,
            networkId: row.networkId,
            slug: row.slug,
            routes: row.routes,
            exitNodes: row.exitNodes,
            createdAt: toIso(row.createdAt)!,
          })),
        };
      }),
  )
  .group("", (app) =>
    app
      .use(requirePolicyAccess("write"))
      .post(
        "/organizations/:orgId/auto-approvers",
        async ({ params, body, authContext, apiKeyAuth }) => {
          const actor = getPolicyActor({ authContext, apiKeyAuth });
          const parsed = createAutoApproverBody.parse(body);
          const created = await db.transaction(async (tx) => {
            const [row] = await tx
              .insert(schema.autoApprovers)
              .values({
                organizationId: params.orgId,
                networkId: parsed.networkId ?? null,
                slug: parsed.slug,
                routes: parsed.routes,
                exitNodes: parsed.exitNodes,
              })
              .returning();
            if (!row) throw new Error("Failed to create auto approver");
            await notifyPolicyChange(
              tx,
              params.orgId,
              actor.userId ?? actor.apiKeyId ?? "system",
              "auto_approver.created",
              row.id,
            );
            return row;
          });
          return {
            id: created.id,
            slug: created.slug,
            createdAt: toIso(created.createdAt)!,
          };
        },
      )
      .delete(
        "/organizations/:orgId/auto-approvers/:id",
        async ({ params, authContext, apiKeyAuth, set }) => {
          const actor = getPolicyActor({ authContext, apiKeyAuth });
          const deleted = await db.transaction(async (tx) => {
            const [row] = await tx
              .delete(schema.autoApprovers)
              .where(
                and(
                  eq(schema.autoApprovers.id, params.id),
                  eq(schema.autoApprovers.organizationId, params.orgId),
                ),
              )
              .returning();
            if (!row) return null;
            await notifyPolicyChange(
              tx,
              params.orgId,
              actor.userId ?? actor.apiKeyId ?? "system",
              "auto_approver.deleted",
              row.id,
            );
            return row;
          });
          if (!deleted) {
            set.status = 404;
            return { error: "Auto approver not found" };
          }
          return { deleted: true };
        },
      ),
  );
