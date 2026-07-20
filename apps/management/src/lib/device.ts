import {
  type PatchDeviceBody,
  type PatchDeviceLabelsBody,
  parseHumanDuration,
  secondsToPgInterval,
} from "@tunnet/api/management";
import { type Database, schema } from "@tunnet/db";
import { formatIp } from "@tunnet/ip";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { mergeDeviceLabels, normalizeDeviceLabels } from "./device-labels";
import {
  deviceDisplayName,
  deviceKind,
  deviceNodeKind,
  normalizeDeviceMetadata,
} from "./device-metadata";
import { toIso } from "./serialize";

type DbConn = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

type DeviceRow = typeof schema.devices.$inferSelect;
type MembershipRow = typeof schema.networkMemberships.$inferSelect;

function formatNullableIp(value: string | null): string | null {
  if (value === null) return null;
  return formatIp(value);
}

function deviceExpiryFields(device: DeviceRow, tags: string[] = []) {
  return {
    labels: normalizeDeviceLabels(device.labels),
    tags,
    inactivityTtl: device.inactivityTtl ?? null,
    expiredAt: toIso(device.expiredAt),
  };
}

export function serializeDeviceDetail(
  device: DeviceRow,
  memberships: Array<MembershipRow & { networkName: string }>,
  tags: string[] = [],
) {
  return {
    endpointId: device.endpointId,
    organizationId: device.organizationId,
    name: deviceDisplayName(device.name, device.metadata, device.endpointId),
    type: deviceKind(device.type, device.metadata),
    kind: deviceNodeKind(device.metadata),
    metadata: normalizeDeviceMetadata(device.metadata, device.endpointId),
    publicIp: formatNullableIp(device.publicIp),
    ipv6Enabled: device.ipv6Enabled,
    ipv6EnabledAt: toIso(device.ipv6EnabledAt),
    tenantIpv6: formatIp(device.tenantIpv6),
    agentConnected: device.agentConnected,
    connectedAt: toIso(device.connectedAt),
    disconnectedAt: toIso(device.disconnectedAt),
    lastHeartbeatAt: toIso(device.lastHeartbeatAt),
    firstSeen: toIso(device.firstSeen)!,
    lastSeen: toIso(device.lastSeen)!,
    ...deviceExpiryFields(device, tags),
    memberships: memberships.map((m) => ({
      networkId: m.networkId,
      networkName: m.networkName,
      assignedIp: formatIp(m.assignedIp),
      status: m.status as "active" | "suspended" | "pending" | "expired",
      firstSeen: toIso(m.firstSeen)!,
      lastSeen: toIso(m.lastSeen)!,
    })),
  };
}

export async function getDeviceInOrg(
  endpointId: string,
  organizationId: string,
  conn: DbConn = db,
) {
  const device = await conn.query.devices.findFirst({
    where: and(
      eq(schema.devices.endpointId, endpointId),
      eq(schema.devices.organizationId, organizationId),
    ),
    with: {
      memberships: {
        with: { network: true },
      },
    },
  });

  if (!device) return null;

  const tagRows = await conn.query.deviceTags.findMany({
    where: eq(schema.deviceTags.endpointId, endpointId),
  });

  return serializeDeviceDetail(
    device,
    device.memberships.map((m) => ({
      ...m,
      networkName: m.network.name,
    })),
    tagRows.map((t) => t.tag).sort(),
  );
}

export async function applyDevicePatch(
  conn: DbConn,
  endpointId: string,
  organizationId: string,
  patch: PatchDeviceBody,
) {
  const device = await conn.query.devices.findFirst({
    where: and(
      eq(schema.devices.endpointId, endpointId),
      eq(schema.devices.organizationId, organizationId),
    ),
  });
  if (!device) return null;

  const updates: Partial<typeof schema.devices.$inferInsert> = {};

  if (patch.name !== undefined) {
    updates.name = patch.name;
  }

  if (patch.ipv6Enabled !== undefined) {
    updates.ipv6Enabled = patch.ipv6Enabled;
    updates.ipv6EnabledAt = patch.ipv6Enabled ? new Date() : null;
  }

  if (patch.expiresIn !== undefined) {
    if (patch.expiresIn === null || patch.expiresIn.toLowerCase() === "never") {
      updates.inactivityTtl = null;
      updates.expiredAt = null;
    } else {
      const secs = parseHumanDuration(patch.expiresIn);
      if (secs === null) throw new Error("Invalid duration");
      updates.inactivityTtl = secondsToPgInterval(secs);
      updates.expiredAt = null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return getDeviceInOrg(endpointId, organizationId, conn);
  }

  const [updated] = await conn
    .update(schema.devices)
    .set(updates)
    .where(eq(schema.devices.endpointId, endpointId))
    .returning();

  if (!updated) return null;

  return getDeviceInOrg(endpointId, organizationId, conn);
}

export async function applyDeviceLabelsPatch(
  conn: DbConn,
  endpointId: string,
  organizationId: string,
  patch: PatchDeviceLabelsBody,
) {
  const device = await conn.query.devices.findFirst({
    where: and(
      eq(schema.devices.endpointId, endpointId),
      eq(schema.devices.organizationId, organizationId),
    ),
  });
  if (!device) return null;

  const labels = mergeDeviceLabels(normalizeDeviceLabels(device.labels), patch);

  const [updated] = await conn
    .update(schema.devices)
    .set({ labels })
    .where(eq(schema.devices.endpointId, endpointId))
    .returning();

  if (!updated) return null;

  return getDeviceInOrg(endpointId, organizationId, conn);
}

export async function getDeviceLabelsInOrg(
  endpointId: string,
  organizationId: string,
  conn: DbConn = db,
) {
  const device = await conn.query.devices.findFirst({
    where: and(
      eq(schema.devices.endpointId, endpointId),
      eq(schema.devices.organizationId, organizationId),
    ),
    columns: { labels: true },
  });
  if (!device) return null;
  return normalizeDeviceLabels(device.labels);
}
