import { paginationQuery } from "@tunnet/api/management";
import { schema } from "@tunnet/db";
import { and, desc, eq, gt } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../../lib/db";
import { toIso } from "../../lib/serialize";
import { getAuth, requireAuth } from "./middleware/authz";
import { sessionPlugin } from "./middleware/session";

export const auditRoutes = new Elysia()
  .use(sessionPlugin)
  .use(requireAuth)
  .get("/organizations/:orgId/audit-log", async ({ authContext, query }) => {
    const auth = getAuth({ authContext });
    const { cursor, limit } = paginationQuery.parse(query);

    const rows = await db.query.auditLog.findMany({
      where: and(
        eq(schema.auditLog.organizationId, auth.organizationId),
        cursor !== undefined ? gt(schema.auditLog.id, cursor) : undefined,
      ),
      orderBy: desc(schema.auditLog.id),
      limit: limit + 1,
    });

    const hasMore = rows.length > limit;
    const entries = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore
      ? (entries[entries.length - 1]?.id ?? null)
      : null;

    return {
      entries: entries.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        actor: row.actor,
        action: row.action,
        target: row.target,
        metadata: row.metadata as Record<string, unknown>,
        traceId: row.traceId,
        at: toIso(row.at)!,
      })),
      nextCursor,
    };
  });
