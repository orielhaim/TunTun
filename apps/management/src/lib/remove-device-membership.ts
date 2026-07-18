import { schema } from "@tunnet/db";
import { and, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { writeAudit } from "./audit";
import { bumpNetworkAndNotify, bumpOrgAndNotify } from "./notify";

type Db = PostgresJsDatabase<typeof schema>;

export type RemoveDeviceMembershipInput = {
  organizationId: string;
  actor: string;
  networkId: string;
  endpointId: string;
  /** Defaults to `device.deleted`. */
  auditAction?: string;
};

export async function removeDeviceMembership(
  tx: Db,
  input: RemoveDeviceMembershipInput,
): Promise<void> {
  const device = await tx.query.devices.findFirst({
    where: and(
      eq(schema.devices.endpointId, input.endpointId),
      eq(schema.devices.organizationId, input.organizationId),
    ),
  });
  if (!device) {
    throw new Error("Device not found");
  }

  const network = await tx.query.networks.findFirst({
    where: and(
      eq(schema.networks.id, input.networkId),
      eq(schema.networks.organizationId, input.organizationId),
    ),
  });
  if (!network) {
    throw new Error("Network not found");
  }

  const [deleted] = await tx
    .delete(schema.networkMemberships)
    .where(
      and(
        eq(schema.networkMemberships.endpointId, input.endpointId),
        eq(schema.networkMemberships.networkId, input.networkId),
      ),
    )
    .returning({ endpointId: schema.networkMemberships.endpointId });

  if (!deleted) {
    throw new Error("Device not found");
  }

  const remaining = await tx.query.networkMemberships.findMany({
    where: eq(schema.networkMemberships.endpointId, input.endpointId),
  });
  if (remaining.length === 0) {
    await tx
      .delete(schema.devices)
      .where(eq(schema.devices.endpointId, input.endpointId));
    await bumpOrgAndNotify(tx, input.organizationId);
  }

  await writeAudit(tx, {
    organizationId: input.organizationId,
    actor: input.actor,
    action: input.auditAction ?? "device.deleted",
    target: deleted.endpointId,
    metadata: { networkId: input.networkId },
  });

  await bumpNetworkAndNotify(tx, input.networkId, input.organizationId);
}

/** Fast path for bulk remove: batched deletes, one audit, one bump per network. */
export async function removeDeviceMembershipsBulk(
  tx: Db,
  input: {
    organizationId: string;
    actor: string;
    items: Array<{ networkId: string; endpointId: string }>;
  },
): Promise<number> {
  if (input.items.length === 0) return 0;

  const seen = new Set<string>();
  const items = input.items.filter((item) => {
    const key = `${item.networkId}:${item.endpointId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const endpointIds = [...new Set(items.map((i) => i.endpointId))];
  const networkIds = [...new Set(items.map((i) => i.networkId))];

  const devices = await tx.query.devices.findMany({
    where: and(
      eq(schema.devices.organizationId, input.organizationId),
      inArray(schema.devices.endpointId, endpointIds),
    ),
    columns: { endpointId: true },
  });
  const deviceSet = new Set(devices.map((d) => d.endpointId));

  const networks = await tx.query.networks.findMany({
    where: and(
      eq(schema.networks.organizationId, input.organizationId),
      inArray(schema.networks.id, networkIds),
    ),
    columns: { id: true },
  });
  const networkSet = new Set(networks.map((n) => n.id));

  const valid = items.filter(
    (i) => deviceSet.has(i.endpointId) && networkSet.has(i.networkId),
  );
  if (valid.length === 0) return 0;

  let deleted = 0;
  const byNetwork = new Map<string, string[]>();
  for (const item of valid) {
    const list = byNetwork.get(item.networkId) ?? [];
    list.push(item.endpointId);
    byNetwork.set(item.networkId, list);
  }

  for (const [networkId, eps] of byNetwork) {
    const removed = await tx
      .delete(schema.networkMemberships)
      .where(
        and(
          eq(schema.networkMemberships.networkId, networkId),
          inArray(schema.networkMemberships.endpointId, eps),
        ),
      )
      .returning({ endpointId: schema.networkMemberships.endpointId });
    deleted += removed.length;
  }

  const stillMembers = await tx.query.networkMemberships.findMany({
    where: inArray(schema.networkMemberships.endpointId, endpointIds),
    columns: { endpointId: true },
  });
  const stillSet = new Set(stillMembers.map((m) => m.endpointId));
  const orphans = endpointIds.filter(
    (id) => deviceSet.has(id) && !stillSet.has(id),
  );
  if (orphans.length > 0) {
    await tx
      .delete(schema.devices)
      .where(inArray(schema.devices.endpointId, orphans));
    await bumpOrgAndNotify(tx, input.organizationId);
  }

  await writeAudit(tx, {
    organizationId: input.organizationId,
    actor: input.actor,
    action: "device.bulk_deleted",
    target: input.organizationId,
    metadata: {
      deleted,
      networks: [...byNetwork.keys()],
      endpointCount: valid.length,
    },
  });

  for (const networkId of byNetwork.keys()) {
    await bumpNetworkAndNotify(tx, networkId, input.organizationId);
  }

  return deleted;
}
