import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { schema } from "@tuntun/db";

type Db = PostgresJsDatabase<typeof schema>;

export async function writeAudit(
  tx: Db,
  input: {
    organizationId: string;
    actor: string;
    action: string;
    target?: string;
    metadata?: Record<string, unknown>;
    traceId?: string;
  },
): Promise<void> {
  await tx.insert(schema.auditLog).values({
    organizationId: input.organizationId,
    actor: input.actor,
    action: input.action,
    target: input.target,
    metadata: input.metadata ?? {},
    traceId: input.traceId,
  });
}
