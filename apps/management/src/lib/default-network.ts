import { formatIpv4Cidr, schema } from "@tuntun/db";

import { writeAudit } from "./audit";
import { db } from "./db";

const DEFAULT_NETWORK_NAME = "default";
const DEFAULT_CIDR = "10.7.0.0/24";
const DEFAULT_MTU = 1280;

export async function createDefaultNetwork(
  organizationId: string,
  actorUserId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.networks)
      .values({
        organizationId,
        name: DEFAULT_NETWORK_NAME,
        cidr: formatIpv4Cidr(DEFAULT_CIDR),
        mtu: DEFAULT_MTU,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create default network");
    }

    await writeAudit(tx, {
      organizationId,
      actor: actorUserId,
      action: "network.created",
      target: created.id,
      metadata: { name: created.name, cidr: created.cidr, default: true },
    });
  });
}
