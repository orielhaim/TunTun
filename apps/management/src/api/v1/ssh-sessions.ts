import {
  sshRecordingCastResponse,
  sshRecordingListResponse,
  sshSessionListResponse,
} from "@tunnet/api/management";
import { schema } from "@tunnet/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { Elysia } from "elysia";

import { pushKillSshSession } from "../../lib/control-plane-client";
import { db } from "../../lib/db";
import { toIso } from "../../lib/serialize";
import { getAuth, requireAuth, requirePermission } from "./middleware/authz";
import { notFound, sessionPlugin } from "./middleware/session";

function serializeSession(row: typeof schema.sshSessions.$inferSelect) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    networkId: row.networkId,
    srcEndpointId: row.srcEndpointId,
    dstEndpointId: row.dstEndpointId,
    srcHostname: row.srcHostname,
    dstHostname: row.dstHostname,
    targetUser: row.targetUser,
    status: row.status as "active" | "ended" | "killed",
    recorded: row.recorded,
    startedAt: toIso(row.startedAt)!,
    endedAt: toIso(row.endedAt),
    durationMs: row.durationMs,
  };
}

function serializeRecording(
  row: typeof schema.sshRecordings.$inferSelect,
  session?: typeof schema.sshSessions.$inferSelect | null,
) {
  return {
    id: row.id,
    sessionId: row.sessionId,
    organizationId: row.organizationId,
    networkId: row.networkId,
    recorderEndpointId: row.recorderEndpointId,
    contentSha256: row.contentSha256,
    byteSize: row.byteSize,
    durationMs: row.durationMs,
    createdAt: toIso(row.createdAt)!,
    srcHostname: session?.srcHostname ?? null,
    dstHostname: session?.dstHostname ?? null,
    targetUser: session?.targetUser ?? null,
  };
}

export const sshSessionsRoutes = new Elysia()
  .use(sessionPlugin)
  .use(requireAuth)
  .get("/organizations/:orgId/ssh-sessions", async ({ authContext, query }) => {
    const auth = getAuth({ authContext });
    const status =
      typeof query.status === "string" && query.status.length > 0
        ? query.status
        : undefined;
    const limit = Math.min(Math.max(Number(query.limit ?? 50) || 50, 1), 200);

    const rows = await db.query.sshSessions.findMany({
      where: status
        ? and(
            eq(schema.sshSessions.organizationId, auth.organizationId),
            eq(schema.sshSessions.status, status),
          )
        : eq(schema.sshSessions.organizationId, auth.organizationId),
      orderBy: [desc(schema.sshSessions.startedAt)],
      limit,
    });

    return sshSessionListResponse.parse({
      sessions: rows.map(serializeSession),
    });
  })
  .get(
    "/organizations/:orgId/ssh-recordings",
    async ({ authContext, query }) => {
      const auth = getAuth({ authContext });
      const limit = Math.min(Math.max(Number(query.limit ?? 50) || 50, 1), 200);

      const rows = await db
        .select({
          recording: schema.sshRecordings,
          session: schema.sshSessions,
        })
        .from(schema.sshRecordings)
        .leftJoin(
          schema.sshSessions,
          eq(schema.sshRecordings.sessionId, schema.sshSessions.id),
        )
        .where(eq(schema.sshRecordings.organizationId, auth.organizationId))
        .orderBy(desc(schema.sshRecordings.createdAt))
        .limit(limit);

      return sshRecordingListResponse.parse({
        recordings: rows.map((r) => serializeRecording(r.recording, r.session)),
      });
    },
  )
  .get(
    "/organizations/:orgId/ssh-sessions/:sessionId/recording",
    async ({ authContext, params }) => {
      const auth = getAuth({ authContext });
      const row = await db.query.sshRecordings.findFirst({
        where: and(
          eq(schema.sshRecordings.organizationId, auth.organizationId),
          eq(schema.sshRecordings.sessionId, params.sessionId),
        ),
      });
      if (!row) return notFound("Recording not found");
      return sshRecordingCastResponse.parse({
        sessionId: row.sessionId,
        contentSha256: row.contentSha256,
        castText: row.castText,
        byteSize: row.byteSize,
      });
    },
  )
  .group("", (app) =>
    app
      .use(requirePermission({ sshSession: ["terminate"] }))
      .post(
        "/organizations/:orgId/ssh-sessions/:sessionId/kill",
        async ({ authContext, params }) => {
          const auth = getAuth({ authContext });
          const session = await db.query.sshSessions.findFirst({
            where: and(
              eq(schema.sshSessions.organizationId, auth.organizationId),
              eq(schema.sshSessions.id, params.sessionId),
            ),
          });
          if (!session) return notFound("Session not found");
          if (session.status !== "active") {
            return { ok: true, alreadyEnded: true };
          }

          await pushKillSshSession({
            endpointId: session.dstEndpointId,
            sessionId: session.id,
          });

          await db
            .update(schema.sshSessions)
            .set({
              status: "killed",
              endedAt: sql`now()`,
            })
            .where(eq(schema.sshSessions.id, session.id));

          return { ok: true };
        },
      ),
  );
