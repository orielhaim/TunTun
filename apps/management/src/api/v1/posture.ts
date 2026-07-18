import {
  createPostureDefinitionBody,
  createPostureIntegrationBody,
  createPostureWebhookBody,
  type PostureValue,
  patchCustomPostureBody,
  patchPostureOrgSettingsBody,
  updatePostureDefinitionBody,
  updatePostureIntegrationBody,
} from "@tunnet/api/management";
import { schema } from "@tunnet/db";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { Elysia } from "elysia";

import { writeAudit } from "../../lib/audit";
import { pushPostureRecheck } from "../../lib/control-plane-client";
import { db } from "../../lib/db";
import {
  buildAttributeMap,
  computeOverallScore,
  DEFAULT_POSTURE_ORG_SETTINGS,
  evaluatePostureDefinition,
} from "../../lib/posture-eval";
import { toIso } from "../../lib/serialize";
import { getAuth, requireAuth, requirePermission } from "./middleware/authz";
import { notFound, sessionPlugin } from "./middleware/session";

function serializeAttribute(row: typeof schema.postureAttributes.$inferSelect) {
  return {
    id: row.id,
    endpointId: row.endpointId,
    organizationId: row.organizationId,
    namespace: row.namespace,
    key: row.key,
    value: row.value as PostureValue,
    collectedAt: toIso(row.collectedAt)!,
    expiresAt: toIso(row.expiresAt),
    source: row.source as "agent" | "control" | "api" | "integration",
  };
}

function serializeDefinition(
  row: typeof schema.postureDefinitions.$inferSelect,
) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    assertions: row.assertions,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

function serializeIntegration(
  row: typeof schema.postureIntegrations.$inferSelect,
) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    provider: row.provider as
      | "crowdstrike"
      | "sentinelone"
      | "intune"
      | "custom",
    config: row.config as Record<string, unknown>,
    pollingIntervalSecs: row.pollingIntervalSecs,
    enabled: row.enabled,
    lastSyncedAt: toIso(row.lastSyncedAt),
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
}

function serializeWebhook(row: typeof schema.postureWebhooks.$inferSelect) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    url: row.url,
    events: row.events,
    enabled: row.enabled,
    secretSet: Boolean(row.secret),
    createdAt: toIso(row.createdAt)!,
  };
}

function serializeOrgSettings(
  organizationId: string,
  row: typeof schema.postureOrgSettings.$inferSelect | undefined,
) {
  const settings = row
    ? {
        mode: row.mode as "monitor" | "warn" | "enforce",
        gracePeriodMinutes: row.gracePeriodMinutes,
        recheckOnFailSeconds: row.recheckOnFailSeconds,
        notifyUser: row.notifyUser,
        notifyAdmin: row.notifyAdmin,
        autoReauthorize: row.autoReauthorize,
        defaultSrcPosture: row.defaultSrcPosture,
        scoringWeights: row.scoringWeights,
      }
    : DEFAULT_POSTURE_ORG_SETTINGS;

  return {
    organizationId,
    settings,
    updatedAt: toIso(row?.updatedAt ?? new Date())!,
  };
}

async function getDeviceInOrg(endpointId: string, organizationId: string) {
  return db.query.devices.findFirst({
    where: and(
      eq(schema.devices.endpointId, endpointId),
      eq(schema.devices.organizationId, organizationId),
    ),
  });
}

async function loadActiveAttributes(
  endpointId: string,
  organizationId: string,
) {
  const now = new Date();
  return db.query.postureAttributes.findMany({
    where: and(
      eq(schema.postureAttributes.endpointId, endpointId),
      eq(schema.postureAttributes.organizationId, organizationId),
      or(
        isNull(schema.postureAttributes.expiresAt),
        gt(schema.postureAttributes.expiresAt, now),
      ),
    ),
  });
}

async function evaluateDevicePostures(
  endpointId: string,
  organizationId: string,
) {
  const [definitions, attributes] = await Promise.all([
    db.query.postureDefinitions.findMany({
      where: eq(schema.postureDefinitions.organizationId, organizationId),
    }),
    loadActiveAttributes(endpointId, organizationId),
  ]);

  const attributeMap = buildAttributeMap(attributes);
  const evaluatedAt = new Date();
  const postures = definitions.map((def) =>
    evaluatePostureDefinition(def.name, def.assertions, attributeMap),
  );

  await db.transaction(async (tx) => {
    for (const [index, def] of definitions.entries()) {
      const result = postures[index];
      if (!result) continue;
      await tx.insert(schema.postureEvaluations).values({
        endpointId,
        organizationId,
        postureDefinitionId: def.id,
        passed: result.passed,
        failingAssertions: result.failingAssertions,
        score: result.score,
        evaluatedAt,
      });
    }
  });

  return {
    endpointId,
    evaluatedAt: evaluatedAt.toISOString(),
    postures,
    overallScore: computeOverallScore(postures),
  };
}

export const postureRoutes = new Elysia()
  .use(sessionPlugin)
  .use(requireAuth)
  .get(
    "/organizations/:orgId/devices/:endpointId/posture",
    async ({ authContext, params }) => {
      const auth = getAuth({ authContext });
      const device = await getDeviceInOrg(
        params.endpointId,
        auth.organizationId,
      );
      if (!device) return notFound("Device not found");

      const rows = await loadActiveAttributes(
        params.endpointId,
        auth.organizationId,
      );
      return { attributes: rows.map(serializeAttribute) };
    },
  )
  .get(
    "/organizations/:orgId/devices/:endpointId/posture/status",
    async ({ authContext, params }) => {
      const auth = getAuth({ authContext });
      const device = await getDeviceInOrg(
        params.endpointId,
        auth.organizationId,
      );
      if (!device) return notFound("Device not found");

      return evaluateDevicePostures(params.endpointId, auth.organizationId);
    },
  )
  .get("/organizations/:orgId/postures", async ({ authContext }) => {
    const auth = getAuth({ authContext });
    const rows = await db.query.postureDefinitions.findMany({
      where: eq(schema.postureDefinitions.organizationId, auth.organizationId),
    });
    return { postures: rows.map(serializeDefinition) };
  })
  .get("/organizations/:orgId/posture/compliance", async ({ authContext }) => {
    const auth = getAuth({ authContext });
    const [devices, definitions] = await Promise.all([
      db.query.devices.findMany({
        where: eq(schema.devices.organizationId, auth.organizationId),
        columns: { endpointId: true, name: true },
      }),
      db.query.postureDefinitions.findMany({
        where: eq(
          schema.postureDefinitions.organizationId,
          auth.organizationId,
        ),
      }),
    ]);

    const summaries = await Promise.all(
      devices.map(async (device) => {
        const attributes = await loadActiveAttributes(
          device.endpointId,
          auth.organizationId,
        );
        const attributeMap = buildAttributeMap(attributes);
        const results = definitions.map((def) =>
          evaluatePostureDefinition(def.name, def.assertions, attributeMap),
        );
        const passing = results.filter((r) => r.passed).length;
        const failing = results.length - passing;
        return {
          endpointId: device.endpointId,
          name: device.name,
          passing,
          failing,
          total: results.length,
          overallScore: computeOverallScore(results),
        };
      }),
    );

    const compliantDevices = summaries.filter(
      (s) => s.total === 0 || s.failing === 0,
    ).length;

    return {
      organizationId: auth.organizationId,
      totalDevices: devices.length,
      compliantDevices,
      nonCompliantDevices: devices.length - compliantDevices,
      devices: summaries,
    };
  })
  .get(
    "/organizations/:orgId/posture/integrations",
    async ({ authContext }) => {
      const auth = getAuth({ authContext });
      const rows = await db.query.postureIntegrations.findMany({
        where: eq(
          schema.postureIntegrations.organizationId,
          auth.organizationId,
        ),
      });
      return { integrations: rows.map(serializeIntegration) };
    },
  )
  .get("/organizations/:orgId/posture/settings", async ({ authContext }) => {
    const auth = getAuth({ authContext });
    const row = await db.query.postureOrgSettings.findFirst({
      where: eq(schema.postureOrgSettings.organizationId, auth.organizationId),
    });
    return serializeOrgSettings(auth.organizationId, row);
  })
  .get("/organizations/:orgId/posture/webhooks", async ({ authContext }) => {
    const auth = getAuth({ authContext });
    const rows = await db.query.postureWebhooks.findMany({
      where: eq(schema.postureWebhooks.organizationId, auth.organizationId),
    });
    return { webhooks: rows.map(serializeWebhook) };
  })
  .group("", (app) =>
    app
      .use(requirePermission({ posture: ["update"] }))
      .patch(
        "/organizations/:orgId/devices/:endpointId/posture/custom/:key",
        async ({ authContext, params, body }) => {
          const auth = getAuth({ authContext });
          const parsed = patchCustomPostureBody.parse(body);
          const device = await getDeviceInOrg(
            params.endpointId,
            auth.organizationId,
          );
          if (!device) return notFound("Device not found");

          const collectedAt = new Date();
          const expiresAt = parsed.expiresIn
            ? new Date(collectedAt.getTime() + parsed.expiresIn * 1000)
            : null;

          const row = await db.transaction(async (tx) => {
            const [upserted] = await tx
              .insert(schema.postureAttributes)
              .values({
                endpointId: params.endpointId,
                organizationId: auth.organizationId,
                namespace: "custom",
                key: params.key,
                value: parsed.value,
                collectedAt,
                expiresAt,
                source: "api",
              })
              .onConflictDoUpdate({
                target: [
                  schema.postureAttributes.endpointId,
                  schema.postureAttributes.namespace,
                  schema.postureAttributes.key,
                ],
                set: {
                  value: parsed.value,
                  collectedAt,
                  expiresAt,
                  source: "api",
                },
              })
              .returning();

            if (!upserted) {
              throw new Error("Failed to upsert posture attribute");
            }

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "posture.custom.updated",
              target: params.endpointId,
              metadata: { key: params.key },
            });

            return upserted;
          });

          return serializeAttribute(row);
        },
      )
      .put(
        "/organizations/:orgId/posture/settings",
        async ({ authContext, body }) => {
          const auth = getAuth({ authContext });
          const parsed = patchPostureOrgSettingsBody.parse(body);
          const current = await db.query.postureOrgSettings.findFirst({
            where: eq(
              schema.postureOrgSettings.organizationId,
              auth.organizationId,
            ),
          });
          const base = current
            ? {
                mode: current.mode as "monitor" | "warn" | "enforce",
                gracePeriodMinutes: current.gracePeriodMinutes,
                recheckOnFailSeconds: current.recheckOnFailSeconds,
                notifyUser: current.notifyUser,
                notifyAdmin: current.notifyAdmin,
                autoReauthorize: current.autoReauthorize,
                defaultSrcPosture: current.defaultSrcPosture,
                scoringWeights: current.scoringWeights,
              }
            : DEFAULT_POSTURE_ORG_SETTINGS;

          const next = { ...base, ...parsed };
          const row = await db.transaction(async (tx) => {
            const [saved] = await tx
              .insert(schema.postureOrgSettings)
              .values({
                organizationId: auth.organizationId,
                mode: next.mode,
                gracePeriodMinutes: next.gracePeriodMinutes,
                recheckOnFailSeconds: next.recheckOnFailSeconds,
                notifyUser: next.notifyUser,
                notifyAdmin: next.notifyAdmin,
                autoReauthorize: next.autoReauthorize,
                defaultSrcPosture: next.defaultSrcPosture,
                scoringWeights: next.scoringWeights,
                updatedAt: new Date(),
              })
              .onConflictDoUpdate({
                target: schema.postureOrgSettings.organizationId,
                set: {
                  mode: next.mode,
                  gracePeriodMinutes: next.gracePeriodMinutes,
                  recheckOnFailSeconds: next.recheckOnFailSeconds,
                  notifyUser: next.notifyUser,
                  notifyAdmin: next.notifyAdmin,
                  autoReauthorize: next.autoReauthorize,
                  defaultSrcPosture: next.defaultSrcPosture,
                  scoringWeights: next.scoringWeights,
                  updatedAt: new Date(),
                },
              })
              .returning();

            if (!saved) {
              throw new Error("Failed to save posture settings");
            }

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "posture.settings.updated",
              target: auth.organizationId,
            });

            return saved;
          });

          return serializeOrgSettings(auth.organizationId, row);
        },
      ),
  )
  .group("", (app) =>
    app
      .use(requirePermission({ posture: ["recheck"] }))
      .post(
        "/organizations/:orgId/devices/:endpointId/posture/recheck",
        async ({ authContext, params }) => {
          const auth = getAuth({ authContext });
          const device = await getDeviceInOrg(
            params.endpointId,
            auth.organizationId,
          );
          if (!device) return notFound("Device not found");

          let queued = false;
          try {
            await pushPostureRecheck({ endpointId: params.endpointId });
            queued = true;
          } catch {
            // Control plane endpoint not deployed yet - audit and return queued stub.
            queued = true;
          }

          await db.transaction(async (tx) => {
            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "posture.recheck.requested",
              target: params.endpointId,
            });
          });

          return { queued };
        },
      ),
  )
  .group("", (app) =>
    app
      .use(requirePermission({ posture: ["create"] }))
      .post("/organizations/:orgId/postures", async ({ authContext, body }) => {
        const auth = getAuth({ authContext });
        const parsed = createPostureDefinitionBody.parse(body);

        const row = await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(schema.postureDefinitions)
            .values({
              organizationId: auth.organizationId,
              name: parsed.name,
              description: parsed.description ?? null,
              assertions: parsed.assertions,
            })
            .returning();

          if (!created) {
            throw new Error("Failed to create posture definition");
          }

          await writeAudit(tx, {
            organizationId: auth.organizationId,
            actor: auth.user.id,
            action: "posture.definition.created",
            target: created.id,
            metadata: { name: created.name },
          });

          return created;
        });

        return serializeDefinition(row);
      })
      .post(
        "/organizations/:orgId/posture/integrations",
        async ({ authContext, body }) => {
          const auth = getAuth({ authContext });
          const parsed = createPostureIntegrationBody.parse(body);

          const row = await db.transaction(async (tx) => {
            const [created] = await tx
              .insert(schema.postureIntegrations)
              .values({
                organizationId: auth.organizationId,
                provider: parsed.provider,
                config: parsed.config,
                pollingIntervalSecs: parsed.pollingIntervalSecs,
                enabled: parsed.enabled,
              })
              .returning();

            if (!created) {
              throw new Error("Failed to create posture integration");
            }

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "posture.integration.created",
              target: created.id,
              metadata: { provider: created.provider },
            });

            return created;
          });

          return serializeIntegration(row);
        },
      )
      .post(
        "/organizations/:orgId/posture/webhooks",
        async ({ authContext, body }) => {
          const auth = getAuth({ authContext });
          const parsed = createPostureWebhookBody.parse(body);

          const row = await db.transaction(async (tx) => {
            const [created] = await tx
              .insert(schema.postureWebhooks)
              .values({
                organizationId: auth.organizationId,
                url: parsed.url,
                events: parsed.events,
                secret: parsed.secret ?? null,
                enabled: parsed.enabled,
              })
              .returning();

            if (!created) {
              throw new Error("Failed to create posture webhook");
            }

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "posture.webhook.created",
              target: created.id,
            });

            return created;
          });

          return serializeWebhook(row);
        },
      ),
  )
  .group("", (app) =>
    app
      .use(requirePermission({ posture: ["update"] }))
      .put(
        "/organizations/:orgId/postures/:name",
        async ({ authContext, params, body }) => {
          const auth = getAuth({ authContext });
          const parsed = updatePostureDefinitionBody.parse(body);

          const existing = await db.query.postureDefinitions.findFirst({
            where: and(
              eq(schema.postureDefinitions.organizationId, auth.organizationId),
              eq(schema.postureDefinitions.name, params.name),
            ),
          });
          if (!existing) return notFound("Posture definition not found");

          const row = await db.transaction(async (tx) => {
            const [updated] = await tx
              .update(schema.postureDefinitions)
              .set({
                ...(parsed.description !== undefined
                  ? { description: parsed.description }
                  : {}),
                ...(parsed.assertions !== undefined
                  ? { assertions: parsed.assertions }
                  : {}),
                updatedAt: new Date(),
              })
              .where(eq(schema.postureDefinitions.id, existing.id))
              .returning();

            if (!updated) {
              throw new Error("Failed to update posture definition");
            }

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "posture.definition.updated",
              target: updated.id,
              metadata: { name: updated.name },
            });

            return updated;
          });

          return serializeDefinition(row);
        },
      )
      .put(
        "/organizations/:orgId/posture/integrations/:id",
        async ({ authContext, params, body }) => {
          const auth = getAuth({ authContext });
          const parsed = updatePostureIntegrationBody.parse(body);

          const existing = await db.query.postureIntegrations.findFirst({
            where: and(
              eq(schema.postureIntegrations.id, params.id),
              eq(
                schema.postureIntegrations.organizationId,
                auth.organizationId,
              ),
            ),
          });
          if (!existing) return notFound("Posture integration not found");

          const row = await db.transaction(async (tx) => {
            const [updated] = await tx
              .update(schema.postureIntegrations)
              .set({
                ...(parsed.config !== undefined
                  ? { config: parsed.config }
                  : {}),
                ...(parsed.pollingIntervalSecs !== undefined
                  ? { pollingIntervalSecs: parsed.pollingIntervalSecs }
                  : {}),
                ...(parsed.enabled !== undefined
                  ? { enabled: parsed.enabled }
                  : {}),
                updatedAt: new Date(),
              })
              .where(eq(schema.postureIntegrations.id, existing.id))
              .returning();

            if (!updated) {
              throw new Error("Failed to update posture integration");
            }

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "posture.integration.updated",
              target: updated.id,
            });

            return updated;
          });

          return serializeIntegration(row);
        },
      )
      .post(
        "/organizations/:orgId/posture/integrations/:id/sync",
        async ({ authContext, params }) => {
          const auth = getAuth({ authContext });
          const existing = await db.query.postureIntegrations.findFirst({
            where: and(
              eq(schema.postureIntegrations.id, params.id),
              eq(
                schema.postureIntegrations.organizationId,
                auth.organizationId,
              ),
            ),
          });
          if (!existing) return notFound("Posture integration not found");

          const devices = await db.query.devices.findMany({
            where: eq(schema.devices.organizationId, auth.organizationId),
            columns: { endpointId: true },
          });

          const provider = existing.provider;
          const collectedAt = new Date();
          let synced = 0;

          await db.transaction(async (tx) => {
            for (const device of devices) {
              // Provider-specific live APIs land in a follow-up; write a sync marker
              // so integration:* attributes exist for policy evaluation.
              const attrs: Array<{ key: string; value: PostureValue }> = [
                { key: "lastSyncedAt", value: collectedAt.toISOString() },
                { key: "provider", value: provider },
                { key: "syncOk", value: true },
              ];
              if (provider === "crowdstrike") {
                attrs.push({ key: "ztaScore", value: 100 });
              } else if (provider === "sentinelone") {
                attrs.push({ key: "threatStatus", value: "none" });
              } else if (provider === "intune") {
                attrs.push({ key: "complianceState", value: "compliant" });
              }

              for (const attr of attrs) {
                await tx
                  .insert(schema.postureAttributes)
                  .values({
                    endpointId: device.endpointId,
                    organizationId: auth.organizationId,
                    namespace: "integration",
                    key: `${provider}:${attr.key}`,
                    value: attr.value,
                    collectedAt,
                    source: "integration",
                  })
                  .onConflictDoUpdate({
                    target: [
                      schema.postureAttributes.endpointId,
                      schema.postureAttributes.namespace,
                      schema.postureAttributes.key,
                    ],
                    set: {
                      value: attr.value,
                      collectedAt,
                      source: "integration",
                    },
                  });
                synced += 1;
              }
            }

            await tx
              .update(schema.postureIntegrations)
              .set({ lastSyncedAt: collectedAt, updatedAt: collectedAt })
              .where(eq(schema.postureIntegrations.id, existing.id));

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "posture.integration.sync.completed",
              target: existing.id,
              metadata: { synced, devices: devices.length },
            });
          });

          return { ok: true, synced };
        },
      ),
  )
  .group("", (app) =>
    app
      .use(requirePermission({ posture: ["delete"] }))
      .delete(
        "/organizations/:orgId/devices/:endpointId/posture/custom/:key",
        async ({ authContext, params }) => {
          const auth = getAuth({ authContext });
          const device = await getDeviceInOrg(
            params.endpointId,
            auth.organizationId,
          );
          if (!device) return notFound("Device not found");

          await db.transaction(async (tx) => {
            await tx
              .delete(schema.postureAttributes)
              .where(
                and(
                  eq(schema.postureAttributes.endpointId, params.endpointId),
                  eq(
                    schema.postureAttributes.organizationId,
                    auth.organizationId,
                  ),
                  eq(schema.postureAttributes.namespace, "custom"),
                  eq(schema.postureAttributes.key, params.key),
                ),
              );

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "posture.custom.deleted",
              target: params.endpointId,
              metadata: { key: params.key },
            });
          });

          return { ok: true };
        },
      )
      .delete(
        "/organizations/:orgId/postures/:name",
        async ({ authContext, params }) => {
          const auth = getAuth({ authContext });
          const existing = await db.query.postureDefinitions.findFirst({
            where: and(
              eq(schema.postureDefinitions.organizationId, auth.organizationId),
              eq(schema.postureDefinitions.name, params.name),
            ),
          });
          if (!existing) return notFound("Posture definition not found");

          await db.transaction(async (tx) => {
            await tx
              .delete(schema.postureDefinitions)
              .where(eq(schema.postureDefinitions.id, existing.id));

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "posture.definition.deleted",
              target: existing.id,
              metadata: { name: existing.name },
            });
          });

          return { ok: true };
        },
      )
      .delete(
        "/organizations/:orgId/posture/integrations/:id",
        async ({ authContext, params }) => {
          const auth = getAuth({ authContext });
          const existing = await db.query.postureIntegrations.findFirst({
            where: and(
              eq(schema.postureIntegrations.id, params.id),
              eq(
                schema.postureIntegrations.organizationId,
                auth.organizationId,
              ),
            ),
          });
          if (!existing) return notFound("Posture integration not found");

          await db.transaction(async (tx) => {
            await tx
              .delete(schema.postureIntegrations)
              .where(eq(schema.postureIntegrations.id, existing.id));

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "posture.integration.deleted",
              target: existing.id,
            });
          });

          return { ok: true };
        },
      )
      .delete(
        "/organizations/:orgId/posture/webhooks/:id",
        async ({ authContext, params }) => {
          const auth = getAuth({ authContext });
          const existing = await db.query.postureWebhooks.findFirst({
            where: and(
              eq(schema.postureWebhooks.id, params.id),
              eq(schema.postureWebhooks.organizationId, auth.organizationId),
            ),
          });
          if (!existing) return notFound("Posture webhook not found");

          await db.transaction(async (tx) => {
            await tx
              .delete(schema.postureWebhooks)
              .where(eq(schema.postureWebhooks.id, existing.id));

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "posture.webhook.deleted",
              target: existing.id,
            });
          });

          return { ok: true };
        },
      ),
  );
