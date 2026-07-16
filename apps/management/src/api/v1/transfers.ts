import {
  acceptRejectTransferBody,
  createTransferBody,
  endpointSendSettingsSchema,
  fileTransferListResponse,
  fileTransferSchema,
  updateSendSettingsBody,
} from "@tunnet/api/management";
import { schema } from "@tunnet/db";
import { and, desc, eq } from "drizzle-orm";
import { Elysia } from "elysia";

import {
  pushAcceptTransfer,
  pushRejectTransfer,
  pushSendFile,
  pushSetSendConsent,
} from "../../lib/control-plane-client";
import { db } from "../../lib/db";
import { toIso } from "../../lib/serialize";
import { getAuth, requireAdmin, requireAuth } from "./middleware/authz";
import { notFound, sessionPlugin } from "./middleware/session";

function serializeTransfer(row: typeof schema.fileTransfers.$inferSelect) {
  return fileTransferSchema.parse({
    id: row.id,
    organizationId: row.organizationId,
    networkId: row.networkId,
    senderEndpointId: row.senderEndpointId,
    receiverEndpointId: row.receiverEndpointId,
    fileName: row.fileName,
    sizeBytes: row.sizeBytes,
    blake3Hash: row.blake3Hash,
    status: row.status,
    progressPct: row.progressPct,
    bytesTransferred: row.bytesTransferred,
    error: row.error,
    message: row.message,
    inboxPath: row.inboxPath,
    createdAt: toIso(row.createdAt)!,
    completedAt: toIso(row.completedAt),
  });
}

function serializeSettings(
  row: typeof schema.endpointSendSettings.$inferSelect,
) {
  return endpointSendSettingsSchema.parse({
    endpointId: row.endpointId,
    organizationId: row.organizationId,
    consentMode: row.consentMode,
    inboxPath: row.inboxPath,
    pinBlobs: row.pinBlobs,
    updatedAt: toIso(row.updatedAt)!,
  });
}

export const transfersRoutes = new Elysia()
  .use(sessionPlugin)
  .use(requireAuth)
  .get("/organizations/:orgId/transfers", async ({ authContext, query }) => {
    const auth = getAuth({ authContext });
    const status =
      typeof query.status === "string" && query.status.length > 0
        ? query.status
        : undefined;
    const limit = Math.min(Math.max(Number(query.limit ?? 50) || 50, 1), 200);

    const rows = await db.query.fileTransfers.findMany({
      where: status
        ? and(
            eq(schema.fileTransfers.organizationId, auth.organizationId),
            eq(schema.fileTransfers.status, status),
          )
        : eq(schema.fileTransfers.organizationId, auth.organizationId),
      orderBy: [desc(schema.fileTransfers.createdAt)],
      limit,
    });

    return fileTransferListResponse.parse({
      transfers: rows.map(serializeTransfer),
    });
  })
  .get(
    "/organizations/:orgId/transfers/:transferId",
    async ({ authContext, params }) => {
      const auth = getAuth({ authContext });
      const row = await db.query.fileTransfers.findFirst({
        where: and(
          eq(schema.fileTransfers.organizationId, auth.organizationId),
          eq(schema.fileTransfers.id, params.transferId),
        ),
      });
      if (!row) throw notFound("transfer not found");
      return serializeTransfer(row);
    },
  )
  .get(
    "/organizations/:orgId/endpoints/:endpointId/send-settings",
    async ({ authContext, params }) => {
      const auth = getAuth({ authContext });
      const row = await db.query.endpointSendSettings.findFirst({
        where: and(
          eq(schema.endpointSendSettings.organizationId, auth.organizationId),
          eq(schema.endpointSendSettings.endpointId, params.endpointId),
        ),
      });
      if (!row) {
        return endpointSendSettingsSchema.parse({
          endpointId: params.endpointId,
          organizationId: auth.organizationId,
          consentMode: "prompt",
          inboxPath: null,
          pinBlobs: false,
          updatedAt: new Date().toISOString(),
        });
      }
      return serializeSettings(row);
    },
  )
  .group("", (app) =>
    app
      .use(requireAdmin)
      .post(
        "/organizations/:orgId/transfers",
        async ({ authContext, body }) => {
          getAuth({ authContext });
          const parsed = createTransferBody.parse(body);
          const transferId = crypto.randomUUID();
          await pushSendFile({
            endpointId: parsed.senderEndpointId,
            transferId,
            path: parsed.path,
            target: parsed.target,
            message: parsed.message,
          });
          return { transferId, status: "queued" as const };
        },
      )
      .post(
        "/organizations/:orgId/transfers/:transferId/accept",
        async ({ authContext, params, body }) => {
          getAuth({ authContext });
          const parsed = acceptRejectTransferBody.parse(body);
          await pushAcceptTransfer({
            endpointId: parsed.endpointId,
            transferId: params.transferId,
          });
          return { ok: true };
        },
      )
      .post(
        "/organizations/:orgId/transfers/:transferId/reject",
        async ({ authContext, params, body }) => {
          getAuth({ authContext });
          const parsed = acceptRejectTransferBody.parse(body);
          await pushRejectTransfer({
            endpointId: parsed.endpointId,
            transferId: params.transferId,
            reason: parsed.reason,
          });
          return { ok: true };
        },
      )
      .put(
        "/organizations/:orgId/endpoints/:endpointId/send-settings",
        async ({ authContext, params, body }) => {
          const auth = getAuth({ authContext });
          const parsed = updateSendSettingsBody.parse(body);
          const existing = await db.query.endpointSendSettings.findFirst({
            where: eq(
              schema.endpointSendSettings.endpointId,
              params.endpointId,
            ),
          });
          const consentMode =
            parsed.consentMode ?? existing?.consentMode ?? "prompt";
          const inboxPath =
            parsed.inboxPath !== undefined
              ? parsed.inboxPath
              : (existing?.inboxPath ?? null);
          const pinBlobs = parsed.pinBlobs ?? existing?.pinBlobs ?? false;

          await db
            .insert(schema.endpointSendSettings)
            .values({
              endpointId: params.endpointId,
              organizationId: auth.organizationId,
              consentMode,
              inboxPath,
              pinBlobs,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: schema.endpointSendSettings.endpointId,
              set: {
                consentMode,
                inboxPath,
                pinBlobs,
                updatedAt: new Date(),
              },
            });

          await pushSetSendConsent({
            endpointId: params.endpointId,
            mode: consentMode,
            inboxPath: inboxPath ?? undefined,
            pinBlobs,
          });

          const row = await db.query.endpointSendSettings.findFirst({
            where: eq(
              schema.endpointSendSettings.endpointId,
              params.endpointId,
            ),
          });
          return serializeSettings(row!);
        },
      ),
  );
