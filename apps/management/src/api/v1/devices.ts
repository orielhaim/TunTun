import {
  patchDeviceBody,
  patchDeviceMembershipBody,
} from "@tuntun/api/management";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";

import { schema } from "@tuntun/db";

import { getAuth } from "./middleware/authz";
import { requireAdmin, requireAuth } from "./middleware/authz";
import { notFound, sessionPlugin } from "./middleware/session";
import { writeAudit } from "../../lib/audit";
import { applyDevicePatch, getDeviceInOrg } from "../../lib/device";
import { db } from "../../lib/db";
import { bumpNetworkAndNotify, bumpOrgAndNotify } from "../../lib/notify";
import { serializeDevice } from "../../lib/serialize-device";

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
      metadata: schema.devices.metadata,
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
      status: schema.networkMemberships.status,
    })
    .from(schema.networkMemberships)
    .innerJoin(
      schema.devices,
      eq(schema.networkMemberships.endpointId, schema.devices.endpointId),
    )
    .where(eq(schema.networkMemberships.networkId, networkId));

  return rows.map(serializeDevice);
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
  .group("", (app) =>
    app
      .use(requireAdmin)
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
            metadata: row.device.metadata,
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
      ),
  )
  .group("", (app) =>
    app
      .use(requireAdmin)
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
            const device = await tx.query.devices.findFirst({
              where: and(
                eq(schema.devices.endpointId, params.endpointId),
                eq(schema.devices.organizationId, auth.organizationId),
              ),
            });
            if (!device) {
              throw new Error("Device not found");
            }

            const [deleted] = await tx
              .delete(schema.networkMemberships)
              .where(
                and(
                  eq(schema.networkMemberships.endpointId, params.endpointId),
                  eq(schema.networkMemberships.networkId, params.networkId),
                ),
              )
              .returning({ endpointId: schema.networkMemberships.endpointId });

            if (!deleted) {
              throw new Error("Device not found");
            }

            const remaining = await tx.query.networkMemberships.findMany({
              where: eq(
                schema.networkMemberships.endpointId,
                params.endpointId,
              ),
            });
            if (remaining.length === 0) {
              await tx
                .delete(schema.devices)
                .where(eq(schema.devices.endpointId, params.endpointId));
              await bumpOrgAndNotify(tx, auth.organizationId);
            }

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "device.deleted",
              target: deleted.endpointId,
              metadata: { networkId: params.networkId },
            });

            await bumpNetworkAndNotify(
              tx,
              params.networkId,
              auth.organizationId,
            );
          });

          return { ok: true };
        },
      ),
  );
