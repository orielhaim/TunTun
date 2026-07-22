import {
  bulkAssignDeviceTagsBody,
  DEFAULT_ORGANIZATION_SETTINGS,
  deleteDevicesBody,
  effectiveAgentConfigSchema,
  inheritRemoteAgentPolicy,
  normalizeNetworkSettings,
  normalizeOrganizationSettings,
  patchDeviceBody,
  patchDeviceLabelsBody,
  patchDeviceMembershipBody,
  patchDeviceTagsBody,
  putDeviceTagsBody,
} from "@tunnet/api/management";
import { schema } from "@tunnet/db";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { writeAudit } from "../../lib/audit";
import { db } from "../../lib/db";
import {
  applyDeviceLabelsPatch,
  applyDevicePatch,
  getDeviceInOrg,
  getDeviceLabelsInOrg,
} from "../../lib/device";
import { bumpNetworkAndNotify, bumpOrgAndNotify } from "../../lib/notify";
import {
  removeDeviceMembership,
  removeDeviceMembershipsBulk,
} from "../../lib/remove-device-membership";
import { toIso } from "../../lib/serialize";
import { serializeDevice } from "../../lib/serialize-device";
import {
  applyDeviceTagChanges,
  assertCanAssignTags,
  ensureTagDefinitionsExist,
  listDeviceTags,
  listDeviceTagsForEndpoints,
  replaceDeviceTags,
} from "../../lib/tag-ownership";
import { getAuth, requireAuth, requirePermission } from "./middleware/authz";
import {
  badRequest,
  forbidden,
  notFound,
  sessionPlugin,
} from "./middleware/session";
import { getTagActor, requireTagAccess } from "./middleware/tag-auth";

async function getNetworkInOrg(networkId: string, organizationId: string) {
  return db.query.networks.findFirst({
    where: and(
      eq(schema.networks.id, networkId),
      eq(schema.networks.organizationId, organizationId),
    ),
  });
}

async function listDevicesOnNetwork(networkId: string) {
  const rows = await db
    .select({
      endpointId: schema.devices.endpointId,
      organizationId: schema.devices.organizationId,
      networkId: schema.networkMemberships.networkId,
      name: schema.devices.name,
      metadata: schema.devices.metadata,
      type: schema.devices.type,
      assignedIp: schema.networkMemberships.assignedIp,
      publicIp: schema.devices.publicIp,
      tenantIpv6: schema.devices.tenantIpv6,
      ipv6Enabled: schema.devices.ipv6Enabled,
      agentConnected: schema.devices.agentConnected,
      connectedAt: schema.devices.connectedAt,
      disconnectedAt: schema.devices.disconnectedAt,
      lastHeartbeatAt: schema.devices.lastHeartbeatAt,
      firstSeen: schema.networkMemberships.firstSeen,
      lastSeen: schema.networkMemberships.lastSeen,
      deviceLastSeen: schema.devices.lastSeen,
      labels: schema.devices.labels,
      inactivityTtl: schema.devices.inactivityTtl,
      expiredAt: schema.devices.expiredAt,
      status: schema.networkMemberships.status,
    })
    .from(schema.networkMemberships)
    .innerJoin(
      schema.devices,
      eq(schema.networkMemberships.endpointId, schema.devices.endpointId),
    )
    .where(eq(schema.networkMemberships.networkId, networkId));

  const tagsByEndpoint = await listDeviceTagsForEndpoints(
    rows.map((r) => r.endpointId),
  );

  return rows.map((row) =>
    serializeDevice({
      ...row,
      tags: tagsByEndpoint.get(row.endpointId) ?? [],
    }),
  );
}

export const devicesRoutes = new Elysia()
  .use(sessionPlugin)
  .use(requireAuth)
  .get(
    "/organizations/:orgId/networks/:networkId/devices",
    async ({ authContext, params }) => {
      const auth = getAuth({ authContext });
      const network = await getNetworkInOrg(
        params.networkId,
        auth.organizationId,
      );
      if (!network) return notFound("Network not found");

      return { devices: await listDevicesOnNetwork(params.networkId) };
    },
  )
  .get(
    "/organizations/:orgId/devices/:endpointId",
    async ({ authContext, params }) => {
      const auth = getAuth({ authContext });
      const device = await getDeviceInOrg(
        params.endpointId,
        auth.organizationId,
      );
      if (!device) return notFound("Device not found");
      return device;
    },
  )
  .get(
    "/organizations/:orgId/devices/:endpointId/config",
    async ({ authContext, params }) => {
      const auth = getAuth({ authContext });
      const device = await db.query.devices.findFirst({
        where: and(
          eq(schema.devices.endpointId, params.endpointId),
          eq(schema.devices.organizationId, auth.organizationId),
        ),
        columns: { endpointId: true, metadata: true },
      });
      if (!device) return notFound("Device not found");

      const org = await db.query.organization.findFirst({
        where: eq(schema.organization.id, auth.organizationId),
        columns: { settings: true },
      });
      const settings = normalizeOrganizationSettings(
        org?.settings ?? DEFAULT_ORGANIZATION_SETTINGS,
      );

      const memberships = await db.query.networkMemberships.findMany({
        where: eq(schema.networkMemberships.endpointId, params.endpointId),
      });
      const primaryMembership =
        memberships.find((m) => m.status === "active") ?? memberships[0];
      const networkId = primaryMembership?.networkId ?? null;

      let networkPolicy = {};
      if (networkId) {
        const network = await db.query.networks.findFirst({
          where: and(
            eq(schema.networks.id, networkId),
            eq(schema.networks.organizationId, auth.organizationId),
          ),
          columns: { settings: true },
        });
        networkPolicy = normalizeNetworkSettings(network?.settings).agentPolicy;
      }

      const remotePolicy = inheritRemoteAgentPolicy(
        settings.agentPolicy,
        networkPolicy,
      );

      const meta =
        device.metadata &&
        typeof device.metadata === "object" &&
        !Array.isArray(device.metadata)
          ? (device.metadata as Record<string, unknown>)
          : {};

      const rawConfig = meta.effectiveConfig ?? null;
      const parsedConfig = rawConfig
        ? effectiveAgentConfigSchema.safeParse(rawConfig)
        : null;
      const reportedAtRaw =
        typeof meta.effectiveConfigReportedAt === "string"
          ? meta.effectiveConfigReportedAt
          : null;
      const reportedAtMs = reportedAtRaw
        ? Date.parse(reportedAtRaw)
        : Number.NaN;
      const reportedAt = Number.isFinite(reportedAtMs)
        ? toIso(new Date(reportedAtMs))
        : null;

      return {
        endpointId: device.endpointId,
        networkId,
        config: parsedConfig?.success ? parsedConfig.data : null,
        reportedAt,
        remotePolicy,
      };
    },
  )
  .get(
    "/organizations/:orgId/devices/:endpointId/labels",
    async ({ authContext, params }) => {
      const auth = getAuth({ authContext });
      const labels = await getDeviceLabelsInOrg(
        params.endpointId,
        auth.organizationId,
      );
      if (!labels) return notFound("Device not found");
      return { labels };
    },
  )
  .get(
    "/organizations/:orgId/devices/:endpointId/tags",
    async ({ authContext, params }) => {
      const auth = getAuth({ authContext });
      const device = await db.query.devices.findFirst({
        where: and(
          eq(schema.devices.endpointId, params.endpointId),
          eq(schema.devices.organizationId, auth.organizationId),
        ),
        columns: { endpointId: true },
      });
      if (!device) return notFound("Device not found");
      return { tags: await listDeviceTags(params.endpointId) };
    },
  )
  .group("", (app) =>
    app
      .use(requireTagAccess("assign"))
      .patch(
        "/organizations/:orgId/devices/:endpointId/tags",
        async ({ authContext, params, body }) => {
          const actor = getTagActor({ authContext, apiKeyAuth: null });
          const parsed = patchDeviceTagsBody.parse(body);
          const device = await db.query.devices.findFirst({
            where: and(
              eq(schema.devices.endpointId, params.endpointId),
              eq(schema.devices.organizationId, actor.organizationId),
            ),
            columns: { endpointId: true },
          });
          if (!device) return notFound("Device not found");

          const touched = [...parsed.add, ...parsed.remove];
          const missing = await ensureTagDefinitionsExist(
            actor.organizationId,
            touched,
          );
          if (missing.length > 0) {
            return badRequest(
              `Unknown tag definition(s): ${missing.join(", ")}`,
            );
          }
          const ownership = await assertCanAssignTags(
            actor.organizationId,
            touched,
            actor,
          );
          if (!ownership.ok) {
            return forbidden();
          }

          const tags = await db.transaction(async (tx) => {
            const next = await applyDeviceTagChanges(
              params.endpointId,
              parsed.add,
              parsed.remove,
              tx,
            );
            await writeAudit(tx, {
              organizationId: actor.organizationId,
              actor: actor.userId ?? actor.apiKeyId ?? "system",
              action: "device.tags_updated",
              target: params.endpointId,
              metadata: parsed,
            });
            await bumpOrgAndNotify(tx, actor.organizationId);
            return next;
          });
          return { tags };
        },
      )
      .put(
        "/organizations/:orgId/devices/:endpointId/tags",
        async ({ authContext, params, body }) => {
          const actor = getTagActor({ authContext, apiKeyAuth: null });
          const parsed = putDeviceTagsBody.parse(body);
          const device = await db.query.devices.findFirst({
            where: and(
              eq(schema.devices.endpointId, params.endpointId),
              eq(schema.devices.organizationId, actor.organizationId),
            ),
            columns: { endpointId: true },
          });
          if (!device) return notFound("Device not found");

          const missing = await ensureTagDefinitionsExist(
            actor.organizationId,
            parsed.tags,
          );
          if (missing.length > 0) {
            return badRequest(
              `Unknown tag definition(s): ${missing.join(", ")}`,
            );
          }
          const ownership = await assertCanAssignTags(
            actor.organizationId,
            parsed.tags,
            actor,
          );
          if (!ownership.ok) {
            return forbidden();
          }

          const tags = await db.transaction(async (tx) => {
            const next = await replaceDeviceTags(
              params.endpointId,
              parsed.tags,
              tx,
            );
            await writeAudit(tx, {
              organizationId: actor.organizationId,
              actor: actor.userId ?? actor.apiKeyId ?? "system",
              action: "device.tags_replaced",
              target: params.endpointId,
              metadata: parsed,
            });
            await bumpOrgAndNotify(tx, actor.organizationId);
            return next;
          });
          return { tags };
        },
      )
      .post(
        "/organizations/:orgId/devices/tags/bulk",
        async ({ authContext, body }) => {
          const actor = getTagActor({ authContext, apiKeyAuth: null });
          const parsed = bulkAssignDeviceTagsBody.parse(body);
          const touched = [...parsed.add, ...parsed.remove];
          const missing = await ensureTagDefinitionsExist(
            actor.organizationId,
            touched,
          );
          if (missing.length > 0) {
            return badRequest(
              `Unknown tag definition(s): ${missing.join(", ")}`,
            );
          }
          const ownership = await assertCanAssignTags(
            actor.organizationId,
            touched,
            actor,
          );
          if (!ownership.ok) {
            return forbidden();
          }

          const updated = await db.transaction(async (tx) => {
            const results: Array<{ endpointId: string; tags: string[] }> = [];
            for (const endpointId of parsed.endpointIds) {
              const device = await tx.query.devices.findFirst({
                where: and(
                  eq(schema.devices.endpointId, endpointId),
                  eq(schema.devices.organizationId, actor.organizationId),
                ),
                columns: { endpointId: true },
              });
              if (!device) continue;
              const tags = await applyDeviceTagChanges(
                endpointId,
                parsed.add,
                parsed.remove,
                tx,
              );
              results.push({ endpointId, tags });
            }
            await writeAudit(tx, {
              organizationId: actor.organizationId,
              actor: actor.userId ?? actor.apiKeyId ?? "system",
              action: "device.tags_bulk_updated",
              target: actor.organizationId,
              metadata: {
                count: results.length,
                add: parsed.add,
                remove: parsed.remove,
              },
            });
            await bumpOrgAndNotify(tx, actor.organizationId);
            return results;
          });
          return { devices: updated };
        },
      ),
  )
  .group("", (app) =>
    app
      .use(requirePermission({ device: ["update", "approve"] }))
      .patch(
        "/organizations/:orgId/devices/:endpointId",
        async ({ authContext, params, body }) => {
          const auth = getAuth({ authContext });
          const parsed = patchDeviceBody.parse(body);

          const updated = await db.transaction(async (tx) => {
            const row = await applyDevicePatch(
              tx,
              params.endpointId,
              auth.organizationId,
              parsed,
            );
            if (!row) return null;

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "device.updated",
              target: row.endpointId,
              metadata: parsed,
            });

            if (parsed.ipv6Enabled !== undefined) {
              await bumpOrgAndNotify(tx, auth.organizationId);
            }

            if (parsed.expiresIn !== undefined) {
              await bumpOrgAndNotify(tx, auth.organizationId);
            }

            return row;
          });

          if (!updated) return notFound("Device not found");
          return updated;
        },
      )
      .patch(
        "/organizations/:orgId/devices/:endpointId/labels",
        async ({ authContext, params, body }) => {
          const auth = getAuth({ authContext });
          const parsed = patchDeviceLabelsBody.parse(body);

          const updated = await db.transaction(async (tx) => {
            const row = await applyDeviceLabelsPatch(
              tx,
              params.endpointId,
              auth.organizationId,
              parsed,
            );
            if (!row) return null;

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "device.labels_updated",
              target: row.endpointId,
              metadata: parsed,
            });

            await bumpOrgAndNotify(tx, auth.organizationId);

            return row;
          });

          if (!updated) return notFound("Device not found");
          return updated;
        },
      )
      .patch(
        "/organizations/:orgId/networks/:networkId/devices/:endpointId",
        async ({ authContext, params, body }) => {
          const auth = getAuth({ authContext });
          const parsed = patchDeviceMembershipBody.parse(body);
          const network = await getNetworkInOrg(
            params.networkId,
            auth.organizationId,
          );
          if (!network) return notFound("Network not found");

          const row = await db.transaction(async (tx) => {
            const [updated] = await tx
              .update(schema.networkMemberships)
              .set({ status: parsed.status })
              .where(
                and(
                  eq(schema.networkMemberships.endpointId, params.endpointId),
                  eq(schema.networkMemberships.networkId, params.networkId),
                ),
              )
              .returning();

            if (!updated) {
              throw new Error("Device not found");
            }

            const device = await tx.query.devices.findFirst({
              where: eq(schema.devices.endpointId, params.endpointId),
            });
            if (!device || device.organizationId !== auth.organizationId) {
              throw new Error("Device not found");
            }

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "device.updated",
              target: updated.endpointId,
              metadata: { status: parsed.status, networkId: params.networkId },
            });

            await bumpNetworkAndNotify(
              tx,
              params.networkId,
              auth.organizationId,
            );

            return { device, membership: updated };
          });

          return serializeDevice({
            endpointId: row.device.endpointId,
            organizationId: row.device.organizationId,
            networkId: row.membership.networkId,
            name: row.device.name,
            metadata: row.device.metadata,
            type: row.device.type,
            labels: row.device.labels,
            expiredAt: row.device.expiredAt,
            inactivityTtl: row.device.inactivityTtl,
            assignedIp: row.membership.assignedIp,
            publicIp: row.device.publicIp,
            tenantIpv6: row.device.tenantIpv6,
            ipv6Enabled: row.device.ipv6Enabled,
            agentConnected: row.device.agentConnected,
            connectedAt: row.device.connectedAt,
            disconnectedAt: row.device.disconnectedAt,
            lastHeartbeatAt: row.device.lastHeartbeatAt,
            firstSeen: row.membership.firstSeen,
            lastSeen: row.membership.lastSeen,
            status: row.membership.status,
          });
        },
      )
      .post(
        "/organizations/:orgId/networks/:networkId/devices/:endpointId/approve",
        async ({ authContext, params }) => {
          const auth = getAuth({ authContext });
          const network = await getNetworkInOrg(
            params.networkId,
            auth.organizationId,
          );
          if (!network) return notFound("Network not found");

          const row = await db
            .transaction(async (tx) => {
              const membership = await tx.query.networkMemberships.findFirst({
                where: and(
                  eq(schema.networkMemberships.endpointId, params.endpointId),
                  eq(schema.networkMemberships.networkId, params.networkId),
                ),
              });
              if (!membership) {
                throw new Error("Device not found");
              }
              if (membership.status !== "pending") {
                throw new Error("Device is not pending approval");
              }

              const device = await tx.query.devices.findFirst({
                where: eq(schema.devices.endpointId, params.endpointId),
              });
              if (!device || device.organizationId !== auth.organizationId) {
                throw new Error("Device not found");
              }

              const [updated] = await tx
                .update(schema.networkMemberships)
                .set({ status: "active" })
                .where(
                  and(
                    eq(schema.networkMemberships.endpointId, params.endpointId),
                    eq(schema.networkMemberships.networkId, params.networkId),
                  ),
                )
                .returning();

              if (!updated) {
                throw new Error("Device not found");
              }

              await writeAudit(tx, {
                organizationId: auth.organizationId,
                actor: auth.user.id,
                action: "device.approved",
                target: updated.endpointId,
                metadata: { networkId: params.networkId },
              });

              await bumpNetworkAndNotify(
                tx,
                params.networkId,
                auth.organizationId,
              );

              return { device, membership: updated };
            })
            .catch((e: unknown) => {
              const message = e instanceof Error ? e.message : "Failed";
              if (message === "Device not found") return null;
              if (message === "Device is not pending approval") {
                return "not_pending" as const;
              }
              throw e;
            });

          if (row === null) return notFound("Device not found");
          if (row === "not_pending") {
            return badRequest("Device is not pending approval");
          }

          return {
            device: serializeDevice({
              endpointId: row.device.endpointId,
              organizationId: row.device.organizationId,
              networkId: row.membership.networkId,
              name: row.device.name,
              metadata: row.device.metadata,
              type: row.device.type,
              labels: row.device.labels,
              expiredAt: row.device.expiredAt,
              inactivityTtl: row.device.inactivityTtl,
              assignedIp: row.membership.assignedIp,
              publicIp: row.device.publicIp,
              tenantIpv6: row.device.tenantIpv6,
              ipv6Enabled: row.device.ipv6Enabled,
              agentConnected: row.device.agentConnected,
              connectedAt: row.device.connectedAt,
              disconnectedAt: row.device.disconnectedAt,
              lastHeartbeatAt: row.device.lastHeartbeatAt,
              firstSeen: row.membership.firstSeen,
              lastSeen: row.membership.lastSeen,
              status: row.membership.status,
            }),
          };
        },
      )
      .post(
        "/organizations/:orgId/networks/:networkId/devices/:endpointId/reject",
        async ({ authContext, params }) => {
          const auth = getAuth({ authContext });
          const network = await getNetworkInOrg(
            params.networkId,
            auth.organizationId,
          );
          if (!network) return notFound("Network not found");

          const result = await db
            .transaction(async (tx) => {
              const membership = await tx.query.networkMemberships.findFirst({
                where: and(
                  eq(schema.networkMemberships.endpointId, params.endpointId),
                  eq(schema.networkMemberships.networkId, params.networkId),
                ),
              });
              if (!membership) {
                throw new Error("Device not found");
              }
              if (membership.status !== "pending") {
                throw new Error("Device is not pending approval");
              }

              await removeDeviceMembership(tx, {
                organizationId: auth.organizationId,
                actor: auth.user.id,
                networkId: params.networkId,
                endpointId: params.endpointId,
                auditAction: "device.rejected",
              });

              return true;
            })
            .catch((e: unknown) => {
              const message = e instanceof Error ? e.message : "Failed";
              if (message === "Device not found") return null;
              if (message === "Device is not pending approval") {
                return "not_pending" as const;
              }
              throw e;
            });

          if (result === null) return notFound("Device not found");
          if (result === "not_pending") {
            return badRequest("Device is not pending approval");
          }

          return { ok: true as const };
        },
      ),
  )
  .group("", (app) =>
    app
      .use(requirePermission({ device: ["delete"] }))
      .delete(
        "/organizations/:orgId/devices",
        async ({ authContext, body }) => {
          const auth = getAuth({ authContext });
          const parsed = deleteDevicesBody.parse(body);

          const seen = new Set<string>();
          const items = parsed.items.filter((item) => {
            const key = `${item.networkId}:${item.endpointId}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          const deleted = await db.transaction(async (tx) => {
            return removeDeviceMembershipsBulk(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              items,
            });
          });

          return { ok: true as const, deleted };
        },
      )
      .delete(
        "/organizations/:orgId/networks/:networkId/devices/:endpointId",
        async ({ authContext, params }) => {
          const auth = getAuth({ authContext });
          const network = await getNetworkInOrg(
            params.networkId,
            auth.organizationId,
          );
          if (!network) return notFound("Network not found");

          await db.transaction(async (tx) => {
            await removeDeviceMembership(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              networkId: params.networkId,
              endpointId: params.endpointId,
            });
          });

          return { ok: true };
        },
      ),
  );
