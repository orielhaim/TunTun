import {
  createAutoApproverBody,
  createDeviceGroupBody,
  createGrantBody,
  createHostAliasBody,
  createIpSetBody,
  createTagDefinitionBody,
  createUserGroupBody,
  patchDeviceGroupBody,
  patchGrantBody,
  patchHostAliasBody,
  patchIpSetBody,
  patchTagDefinitionBody,
  patchUserGroupBody,
} from "@tunnet/api/management";
import { schema } from "@tunnet/db";
import { and, eq, inArray } from "drizzle-orm";
import { Elysia } from "elysia";

import { writeAudit } from "../../lib/audit";
import { db } from "../../lib/db";
import { bumpOrgAndNotify } from "../../lib/notify";
import { toIso } from "../../lib/serialize";
import {
  getPolicyActor,
  policyAuthPlugin,
  requirePolicyAccess,
} from "./middleware/policy-auth";
import { badRequest, notFound } from "./middleware/session";

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
      .use(requirePolicyAccess("read"))
      .get("/organizations/:orgId/user-groups", async ({ params }) => {
        const groups = await db.query.userGroups.findMany({
          where: eq(schema.userGroups.organizationId, params.orgId),
        });
        const groupIds = groups.map((g) => g.id);
        const members =
          groupIds.length > 0
            ? await db.query.userGroupMembers.findMany({
                where: inArray(schema.userGroupMembers.groupId, groupIds),
              })
            : [];
        const membersByGroup = new Map<string, typeof members>();
        for (const member of members) {
          const list = membersByGroup.get(member.groupId) ?? [];
          list.push(member);
          membersByGroup.set(member.groupId, list);
        }
        return {
          groups: groups.map((group) => ({
            id: group.id,
            organizationId: group.organizationId,
            name: group.name,
            description: group.description,
            labels: group.labels,
            members: (membersByGroup.get(group.id) ?? []).map((m) => ({
              userId: m.userId,
              email: m.email,
            })),
            createdAt: toIso(group.createdAt)!,
            updatedAt: toIso(group.updatedAt)!,
          })),
        };
      }),
  )
  .group("", (app) =>
    app
      .use(requirePolicyAccess("write"))
      .post(
        "/organizations/:orgId/user-groups",
        async ({ params, body, authContext, apiKeyAuth }) => {
          const actor = getPolicyActor({ authContext, apiKeyAuth });
          const parsed = createUserGroupBody.parse(body);
          const created = await db.transaction(async (tx) => {
            const [group] = await tx
              .insert(schema.userGroups)
              .values({
                organizationId: params.orgId,
                name: parsed.name,
                description: parsed.description ?? null,
                labels: parsed.labels ?? {},
              })
              .returning();
            if (!group) throw new Error("Failed to create user group");
            if (parsed.members.length > 0) {
              await tx.insert(schema.userGroupMembers).values(
                parsed.members.map((member) => ({
                  groupId: group.id,
                  userId: member.userId ?? null,
                  email: member.email ?? null,
                })),
              );
            }
            await notifyPolicyChange(
              tx,
              params.orgId,
              actor.userId ?? actor.apiKeyId ?? "system",
              "user_group.created",
              group.id,
            );
            return group;
          });
          return {
            id: created.id,
            organizationId: created.organizationId,
            name: created.name,
            createdAt: toIso(created.createdAt)!,
          };
        },
      )
      .patch(
        "/organizations/:orgId/user-groups/:id",
        async ({ params, body, authContext, apiKeyAuth, set }) => {
          const actor = getPolicyActor({ authContext, apiKeyAuth });
          const parsed = patchUserGroupBody.parse(body);
          const updated = await db.transaction(async (tx) => {
            const [group] = await tx
              .update(schema.userGroups)
              .set({
                ...(parsed.name !== undefined ? { name: parsed.name } : {}),
                ...(parsed.description !== undefined
                  ? { description: parsed.description }
                  : {}),
                ...(parsed.labels !== undefined
                  ? { labels: parsed.labels }
                  : {}),
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(schema.userGroups.id, params.id),
                  eq(schema.userGroups.organizationId, params.orgId),
                ),
              )
              .returning();
            if (!group) return null;
            if (parsed.members !== undefined) {
              await tx
                .delete(schema.userGroupMembers)
                .where(eq(schema.userGroupMembers.groupId, group.id));
              if (parsed.members.length > 0) {
                await tx.insert(schema.userGroupMembers).values(
                  parsed.members.map((member) => ({
                    groupId: group.id,
                    userId: member.userId ?? null,
                    email: member.email ?? null,
                  })),
                );
              }
            }
            await notifyPolicyChange(
              tx,
              params.orgId,
              actor.userId ?? actor.apiKeyId ?? "system",
              "user_group.updated",
              group.id,
            );
            return group;
          });
          if (!updated) {
            set.status = 404;
            return { error: "User group not found" };
          }
          return {
            id: updated.id,
            name: updated.name,
            updatedAt: toIso(updated.updatedAt)!,
          };
        },
      )
      .delete(
        "/organizations/:orgId/user-groups/:id",
        async ({ params, authContext, apiKeyAuth, set }) => {
          const actor = getPolicyActor({ authContext, apiKeyAuth });
          const deleted = await db.transaction(async (tx) => {
            const [group] = await tx
              .delete(schema.userGroups)
              .where(
                and(
                  eq(schema.userGroups.id, params.id),
                  eq(schema.userGroups.organizationId, params.orgId),
                ),
              )
              .returning();
            if (!group) return null;
            await notifyPolicyChange(
              tx,
              params.orgId,
              actor.userId ?? actor.apiKeyId ?? "system",
              "user_group.deleted",
              group.id,
            );
            return group;
          });
          if (!deleted) {
            set.status = 404;
            return { error: "User group not found" };
          }
          return { deleted: true };
        },
      ),
  )
  .group("", (app) =>
    app
      .use(requirePolicyAccess("read"))
      .get("/organizations/:orgId/device-groups", async ({ params }) => {
        const groups = await db.query.deviceGroups.findMany({
          where: eq(schema.deviceGroups.organizationId, params.orgId),
        });
        const groupIds = groups.map((g) => g.id);
        const members =
          groupIds.length > 0
            ? await db.query.deviceGroupMembers.findMany({
                where: inArray(schema.deviceGroupMembers.groupId, groupIds),
              })
            : [];
        const membersByGroup = new Map<string, typeof members>();
        for (const member of members) {
          const list = membersByGroup.get(member.groupId) ?? [];
          list.push(member);
          membersByGroup.set(member.groupId, list);
        }
        return {
          groups: groups.map((group) => ({
            id: group.id,
            organizationId: group.organizationId,
            networkId: group.networkId,
            name: group.name,
            description: group.description,
            labels: group.labels,
            members: (membersByGroup.get(group.id) ?? []).map((m) => ({
              endpointId: m.endpointId,
            })),
            createdAt: toIso(group.createdAt)!,
          })),
        };
      }),
  )
  .group("", (app) =>
    app
      .use(requirePolicyAccess("write"))
      .post(
        "/organizations/:orgId/device-groups",
        async ({ params, body, authContext, apiKeyAuth, set }) => {
          const actor = getPolicyActor({ authContext, apiKeyAuth });
          const parsed = createDeviceGroupBody.parse(body);
          if (parsed.networkId) {
            const network = await db.query.networks.findFirst({
              where: and(
                eq(schema.networks.id, parsed.networkId),
                eq(schema.networks.organizationId, params.orgId),
              ),
            });
            if (!network) return notFound("Network not found");
          }
          for (const member of parsed.members) {
            const device = await db.query.devices.findFirst({
              where: and(
                eq(schema.devices.endpointId, member.endpointId),
                eq(schema.devices.organizationId, params.orgId),
              ),
            });
            if (!device) {
              return badRequest(
                `Device ${member.endpointId.slice(0, 8)}… not found in organization`,
              );
            }
          }
          const created = await db.transaction(async (tx) => {
            const [group] = await tx
              .insert(schema.deviceGroups)
              .values({
                organizationId: params.orgId,
                networkId: parsed.networkId ?? null,
                name: parsed.name,
                description: parsed.description ?? null,
                labels: parsed.labels ?? {},
              })
              .returning();
            if (!group) throw new Error("Failed to create device group");
            if (parsed.members.length > 0) {
              await tx.insert(schema.deviceGroupMembers).values(
                parsed.members.map((member) => ({
                  groupId: group.id,
                  endpointId: member.endpointId,
                })),
              );
            }
            await notifyPolicyChange(
              tx,
              params.orgId,
              actor.userId ?? actor.apiKeyId ?? "system",
              "device_group.created",
              group.id,
            );
            return group;
          });
          return {
            id: created.id,
            name: created.name,
            createdAt: toIso(created.createdAt)!,
          };
        },
      )
      .patch(
        "/organizations/:orgId/device-groups/:id",
        async ({ params, body, authContext, apiKeyAuth, set }) => {
          const actor = getPolicyActor({ authContext, apiKeyAuth });
          const parsed = patchDeviceGroupBody.parse(body);
          const updated = await db.transaction(async (tx) => {
            const [group] = await tx
              .update(schema.deviceGroups)
              .set({
                ...(parsed.name !== undefined ? { name: parsed.name } : {}),
                ...(parsed.networkId !== undefined
                  ? { networkId: parsed.networkId ?? null }
                  : {}),
                ...(parsed.description !== undefined
                  ? { description: parsed.description }
                  : {}),
                ...(parsed.labels !== undefined
                  ? { labels: parsed.labels }
                  : {}),
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(schema.deviceGroups.id, params.id),
                  eq(schema.deviceGroups.organizationId, params.orgId),
                ),
              )
              .returning();
            if (!group) return null;
            if (parsed.members !== undefined) {
              await tx
                .delete(schema.deviceGroupMembers)
                .where(eq(schema.deviceGroupMembers.groupId, group.id));
              if (parsed.members.length > 0) {
                await tx.insert(schema.deviceGroupMembers).values(
                  parsed.members.map((member) => ({
                    groupId: group.id,
                    endpointId: member.endpointId,
                  })),
                );
              }
            }
            await notifyPolicyChange(
              tx,
              params.orgId,
              actor.userId ?? actor.apiKeyId ?? "system",
              "device_group.updated",
              group.id,
            );
            return group;
          });
          if (!updated) {
            set.status = 404;
            return { error: "Device group not found" };
          }
          return { id: updated.id, name: updated.name };
        },
      )
      .delete(
        "/organizations/:orgId/device-groups/:id",
        async ({ params, authContext, apiKeyAuth, set }) => {
          const actor = getPolicyActor({ authContext, apiKeyAuth });
          const deleted = await db.transaction(async (tx) => {
            const [group] = await tx
              .delete(schema.deviceGroups)
              .where(
                and(
                  eq(schema.deviceGroups.id, params.id),
                  eq(schema.deviceGroups.organizationId, params.orgId),
                ),
              )
              .returning();
            if (!group) return null;
            await notifyPolicyChange(
              tx,
              params.orgId,
              actor.userId ?? actor.apiKeyId ?? "system",
              "device_group.deleted",
              group.id,
            );
            return group;
          });
          if (!deleted) {
            set.status = 404;
            return { error: "Device group not found" };
          }
          return { deleted: true };
        },
      ),
  )
  .group("", (app) =>
    app
      .use(requirePolicyAccess("read"))
      .get("/organizations/:orgId/tag-definitions", async ({ params }) => {
        const rows = await db.query.tagDefinitions.findMany({
          where: eq(schema.tagDefinitions.organizationId, params.orgId),
        });
        return {
          tags: rows.map((row) => ({
            id: row.id,
            organizationId: row.organizationId,
            name: row.name,
            owners: row.owners,
            createdAt: toIso(row.createdAt)!,
          })),
        };
      }),
  )
  .group("", (app) =>
    app
      .use(requirePolicyAccess("write"))
      .post(
        "/organizations/:orgId/tag-definitions",
        async ({ params, body, authContext, apiKeyAuth }) => {
          const actor = getPolicyActor({ authContext, apiKeyAuth });
          const parsed = createTagDefinitionBody.parse(body);
          const [created] = await db.transaction(async (tx) => {
            const [row] = await tx
              .insert(schema.tagDefinitions)
              .values({
                organizationId: params.orgId,
                name: parsed.name,
                owners: parsed.owners,
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
            createdAt: toIso(created.createdAt)!,
          };
        },
      )
      .patch(
        "/organizations/:orgId/tag-definitions/:id",
        async ({ params, body, authContext, apiKeyAuth, set }) => {
          const actor = getPolicyActor({ authContext, apiKeyAuth });
          const parsed = patchTagDefinitionBody.parse(body);
          const updated = await db.transaction(async (tx) => {
            const [row] = await tx
              .update(schema.tagDefinitions)
              .set({
                ...(parsed.name !== undefined ? { name: parsed.name } : {}),
                ...(parsed.owners !== undefined
                  ? { owners: parsed.owners }
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
          return { id: updated.id, name: updated.name };
        },
      )
      .delete(
        "/organizations/:orgId/tag-definitions/:id",
        async ({ params, authContext, apiKeyAuth, set }) => {
          const actor = getPolicyActor({ authContext, apiKeyAuth });
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
