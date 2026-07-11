import { sql } from "drizzle-orm";

import { db } from "./db";

/**
 * Legacy `formatIpv4Cidr` used `Address4.correctForm()`, which drops the
 * prefix. Postgres then stored `10.7.0.0` as `/32`, so agents got the
 * network address and Windows DNS/bind failed.
 *
 * Repair: any IPv4 network stored as `/32` whose host ends in `.0` was
 * almost certainly meant to be `/24` (our default mesh size).
 */
export async function repairStrippedMeshCidrs(): Promise<void> {
  const fixed = await db.execute(sql`
    UPDATE networks
    SET
      cidr = set_masklen(cidr, 24)::cidr,
      version = version + 1
    WHERE family(cidr) = 4
      AND masklen(cidr) = 32
      AND split_part(host(cidr), '.', 4) = '0'
    RETURNING id
  `);

  const rows = Array.isArray(fixed)
    ? fixed
    : ((fixed as { rows?: unknown }).rows ?? []);
  const networkIds = (rows as { id: string }[])
    .map((r) => r.id)
    .filter(Boolean);

  if (networkIds.length === 0) {
    return;
  }

  console.log(
    `Repaired ${networkIds.length} network CIDR(s) stripped to /32 → /24`,
  );

  // Drop unusable host assignments (network/broadcast); next enroll reallocates.
  await db.execute(sql`
    DELETE FROM network_memberships nm
    USING networks n
    WHERE nm.network_id = n.id
      AND n.id IN (${sql.join(
        networkIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
      AND (
        host(nm.assigned_ip)::inet = network(n.cidr)
        OR host(nm.assigned_ip)::inet = broadcast(n.cidr)
      )
  `);

  await db.execute(sql`
    UPDATE organization o
    SET snapshot_version = snapshot_version + 1
    FROM networks n
    WHERE n.organization_id = o.id
      AND n.id IN (${sql.join(
        networkIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
  `);
}
