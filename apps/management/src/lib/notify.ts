import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { schema } from "@tuntun/db";

export const NOTIFY_CHANNEL = "tuntun:network_changed";
export const ORG_NOTIFY_CHANNEL = "tuntun:org_changed";
export const PRESENCE_NOTIFY_CHANNEL = "tuntun:device_presence";
export const ENTITY_NOTIFY_CHANNEL = "tuntun:entity_changed";

type Db = PostgresJsDatabase<typeof schema>;

export async function bumpNetworkVersion(
  tx: Db,
  networkId: string,
  organizationId: string,
): Promise<void> {
  await tx
    .update(schema.networks)
    .set({ version: sql`${schema.networks.version} + 1` })
    .where(
      sql`${schema.networks.id} = ${networkId}::uuid AND ${schema.networks.organizationId} = ${organizationId}`,
    );
}

export async function bumpOrgSnapshotVersion(
  tx: Db,
  organizationId: string,
): Promise<void> {
  await tx
    .update(schema.organization)
    .set({
      snapshotVersion: sql`${schema.organization.snapshotVersion} + 1`,
    })
    .where(eq(schema.organization.id, organizationId));
}

export async function notifyNetworkChanged(
  tx: Db,
  networkId: string,
): Promise<void> {
  await tx.execute(sql`SELECT pg_notify(${NOTIFY_CHANNEL}, ${networkId})`);
}

export async function notifyOrgChanged(
  tx: Db,
  organizationId: string,
): Promise<void> {
  await tx.execute(
    sql`SELECT pg_notify(${ORG_NOTIFY_CHANNEL}, ${organizationId})`,
  );
}

export async function notifyEntityChanged(
  tx: Db,
  input: {
    organizationId: string;
    kind: "tunnel" | "serve" | "relay";
    entityId: string;
    networkId?: string | null;
  },
): Promise<void> {
  const payload = JSON.stringify({
    organizationId: input.organizationId,
    kind: input.kind,
    entityId: input.entityId,
    networkId: input.networkId ?? null,
  });
  await tx.execute(sql`SELECT pg_notify(${ENTITY_NOTIFY_CHANNEL}, ${payload})`);
}

export async function bumpNetworkAndNotify(
  tx: Db,
  networkId: string,
  organizationId: string,
): Promise<void> {
  await bumpNetworkVersion(tx, networkId, organizationId);
  await notifyNetworkChanged(tx, networkId);
}

export async function bumpOrgAndNotify(
  tx: Db,
  organizationId: string,
): Promise<void> {
  await bumpOrgSnapshotVersion(tx, organizationId);
  await notifyOrgChanged(tx, organizationId);
}
