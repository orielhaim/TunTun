import { schema } from "@tuntun/db";
import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { writeAudit } from "./audit";
import { bumpNetworkAndNotify, bumpOrgAndNotify } from "./notify";

type Db = PostgresJsDatabase<typeof schema>;

export type RemoveDeviceMembershipInput = {
  organizationId: string;
  actor: string;
  networkId: string;
  endpointId: string;
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
    action: "device.deleted",
    target: deleted.endpointId,
    metadata: { networkId: input.networkId },
  });

  await bumpNetworkAndNotify(tx, input.networkId, input.organizationId);
}
