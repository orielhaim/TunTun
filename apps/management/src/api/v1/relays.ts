import { randomBytes } from "node:crypto";
import { createRelayBody, patchRelayBody } from "@tunnet/api/management";
import { schema } from "@tunnet/db";
import { and, desc, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { blake3 } from "hash-wasm";

import { writeAudit } from "../../lib/audit";
import { db } from "../../lib/db";
import { notifyEntityChanged } from "../../lib/notify";
import { toIso } from "../../lib/serialize";
import { getAuth, requireAuth, requirePermission } from "./middleware/authz";
import { notFound, sessionPlugin } from "./middleware/session";

function serializeRelay(row: typeof schema.relays.$inferSelect) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    kind: row.kind as "hosted" | "self_hosted",
    region: row.region,
    publicIp: row.publicIp,
    domain: row.domain,
    capacityLimit: row.capacityLimit,
    activeTunnels: row.activeTunnels,
    status: row.status as
      | "pending"
      | "healthy"
      | "degraded"
      | "offline"
      | "disabled",
    lastHeartbeatAt: toIso(row.lastHeartbeatAt),
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

export const relaysRoutes = new Elysia()
  .use(sessionPlugin)
  .use(requireAuth)
  .get("/organizations/:orgId/relays", async ({ authContext }) => {
    const auth = getAuth({ authContext });
    const rows = await db.query.relays.findMany({
      where: eq(schema.relays.organizationId, auth.organizationId),
      orderBy: [desc(schema.relays.createdAt)],
    });
    return { relays: rows.map(serializeRelay) };
  })
  .get(
    "/organizations/:orgId/relays/:relayId",
    async ({ authContext, params }) => {
      const auth = getAuth({ authContext });
      const row = await db.query.relays.findFirst({
        where: and(
          eq(schema.relays.id, params.relayId),
          eq(schema.relays.organizationId, auth.organizationId),
        ),
      });
      if (!row) return notFound("Relay not found");
      return { relay: serializeRelay(row) };
    },
  )
  .get(
    "/organizations/:orgId/relays/:relayId/health",
    async ({ authContext, params, query }) => {
      const auth = getAuth({ authContext });
      const relay = await db.query.relays.findFirst({
        where: and(
          eq(schema.relays.id, params.relayId),
          eq(schema.relays.organizationId, auth.organizationId),
        ),
      });
      if (!relay) return notFound("Relay not found");

      const rawLimit =
        typeof query === "object" &&
        query !== null &&
        "limit" in query &&
        typeof query.limit === "string"
          ? Number.parseInt(query.limit, 10)
          : 100;
      const limit = Number.isFinite(rawLimit)
        ? Math.min(Math.max(rawLimit, 1), 500)
        : 100;

      const heartbeats = await db.query.relayHeartbeats.findMany({
        where: eq(schema.relayHeartbeats.relayId, params.relayId),
        orderBy: [desc(schema.relayHeartbeats.recordedAt)],
        limit,
      });

      const meta =
        relay.metadata && typeof relay.metadata === "object"
          ? (relay.metadata as { certValidUntil?: string })
          : {};
      const validUntil =
        typeof meta.certValidUntil === "string" ? meta.certValidUntil : null;

      return {
        heartbeats: heartbeats.map((h) => ({
          id: h.id,
          relayId: h.relayId,
          activeTunnels: h.activeTunnels,
          recordedAt: toIso(h.recordedAt)!,
        })),
        cert: { validUntil },
        lastHeartbeatAt: toIso(relay.lastHeartbeatAt),
        status: relay.status,
        activeTunnels: relay.activeTunnels,
      };
    },
  )
  .group("", (app) =>
    app
      .use(requirePermission({ relay: ["create", "update", "delete"] }))
      .post("/organizations/:orgId/relays", async ({ authContext, body }) => {
        const auth = getAuth({ authContext });
        const parsed = createRelayBody.parse(body);

        const token = randomBytes(32).toString("base64url");
        const tokenHash = await blake3(Buffer.from(token));
        const expiresAt = new Date(Date.now() + 60 * 60_000);

        const result = await db.transaction(async (tx) => {
          const [relay] = await tx
            .insert(schema.relays)
            .values({
              organizationId: auth.organizationId,
              name: parsed.name,
              kind: parsed.kind,
              region: parsed.region,
              domain: parsed.domain,
              publicIp: parsed.publicIp ?? null,
              capacityLimit: parsed.capacityLimit,
              status: "pending",
            })
            .returning();

          await tx.insert(schema.relayRegistrationTokens).values({
            tokenHash,
            organizationId: auth.organizationId,
            relayId: relay?.id,
            createdBy: auth.user.id,
            expiresAt,
          });

          await writeAudit(tx, {
            organizationId: auth.organizationId,
            actor: auth.user.id,
            action: "relay.create",
            target: relay?.id,
            metadata: { name: parsed.name, domain: parsed.domain },
          });

          await notifyEntityChanged(tx, {
            organizationId: auth.organizationId,
            kind: "relay",
            entityId: relay?.id,
          });

          return relay!;
        });

        return {
          relay: serializeRelay(result),
          registrationToken: token,
          expiresAt: toIso(expiresAt)!,
        };
      })
      .patch(
        "/organizations/:orgId/relays/:relayId",
        async ({ authContext, params, body }) => {
          const auth = getAuth({ authContext });
          const parsed = patchRelayBody.parse(body);

          const existing = await db.query.relays.findFirst({
            where: and(
              eq(schema.relays.id, params.relayId),
              eq(schema.relays.organizationId, auth.organizationId),
            ),
          });
          if (!existing) return notFound("Relay not found");

          const [updated] = await db
            .update(schema.relays)
            .set({
              ...parsed,
              updatedAt: new Date(),
            })
            .where(eq(schema.relays.id, params.relayId))
            .returning();

          await writeAudit(db, {
            organizationId: auth.organizationId,
            actor: auth.user.id,
            action: "relay.update",
            target: params.relayId,
            metadata: parsed,
          });

          await notifyEntityChanged(db, {
            organizationId: auth.organizationId,
            kind: "relay",
            entityId: params.relayId,
          });

          return { relay: serializeRelay(updated!) };
        },
      )
      .delete(
        "/organizations/:orgId/relays/:relayId",
        async ({ authContext, params }) => {
          const auth = getAuth({ authContext });
          const existing = await db.query.relays.findFirst({
            where: and(
              eq(schema.relays.id, params.relayId),
              eq(schema.relays.organizationId, auth.organizationId),
            ),
          });
          if (!existing) return notFound("Relay not found");

          await db
            .delete(schema.relays)
            .where(eq(schema.relays.id, params.relayId));

          await writeAudit(db, {
            organizationId: auth.organizationId,
            actor: auth.user.id,
            action: "relay.delete",
            target: params.relayId,
            metadata: { name: existing.name },
          });

          await notifyEntityChanged(db, {
            organizationId: auth.organizationId,
            kind: "relay",
            entityId: params.relayId,
          });

          return { ok: true };
        },
      ),
  );
