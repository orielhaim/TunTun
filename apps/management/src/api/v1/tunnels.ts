import { randomBytes } from "node:crypto";
import {
  createTunnelBody,
  createTunnelRoutingRuleBody,
  patchTunnelBody,
  patchTunnelRoutingRuleBody,
} from "@tunnet/api/management";
import { schema } from "@tunnet/db";
import { formatIp } from "@tunnet/ip";
import * as argon2 from "argon2";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { blake3 } from "hash-wasm";

import { writeAudit } from "../../lib/audit";
import { pushOpenTunnel, pushStopTunnel } from "../../lib/control-plane-client";
import { db } from "../../lib/db";
import { deviceDisplayName } from "../../lib/device-metadata";
import { bumpNetworkAndNotify, notifyEntityChanged } from "../../lib/notify";
import { toIso } from "../../lib/serialize";
import { getAuth, requireAuth, requirePermission } from "./middleware/authz";
import { conflict, notFound, sessionPlugin } from "./middleware/session";

function serializeTunnel(
  row: typeof schema.tunnels.$inferSelect,
  extras?: { hostname?: string; relayName?: string },
) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    networkId: row.networkId,
    endpointId: row.endpointId,
    relayId: row.relayId,
    localPort: row.localPort,
    protocol: row.protocol as "https" | "tcp",
    subdomain: row.subdomain,
    publicHostname: row.publicHostname,
    status: row.status as
      | "connecting"
      | "active"
      | "error"
      | "stopped"
      | "expired",
    errorMessage: row.errorMessage,
    expiresAt: toIso(row.expiresAt),
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
    basicAuth:
      row.basicAuthUser && row.basicAuthPasswordHash
        ? ({ username: row.basicAuthUser, enabled: true } as const)
        : null,
    hostname: extras?.hostname,
    relayName: extras?.relayName,
  };
}

async function resolveTargetIpv4(
  networkId: string,
  targetEndpointId: string | null | undefined,
): Promise<string | null> {
  if (!targetEndpointId) return null;
  const membership = await db.query.networkMemberships.findFirst({
    where: and(
      eq(schema.networkMemberships.networkId, networkId),
      eq(schema.networkMemberships.endpointId, targetEndpointId),
      eq(schema.networkMemberships.status, "active"),
    ),
  });
  if (!membership?.assignedIp) return null;
  return formatIp(membership.assignedIp);
}

function suggestSubdomain(base: string): string {
  const suffix = randomBytes(2).toString("hex");
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 55);
  return `${cleaned || "app"}-${suffix}`;
}

function serializeRoutingRule(
  row: typeof schema.tunnelRoutingRules.$inferSelect,
) {
  const base = {
    id: row.id,
    tunnelId: row.tunnelId,
    organizationId: row.organizationId,
    priority: row.priority,
    targetEndpointId: row.targetEndpointId,
    targetPort: row.targetPort,
    createdAt: toIso(row.createdAt)!,
    updatedAt: toIso(row.updatedAt)!,
  };
  if (row.kind === "path") {
    return {
      ...base,
      kind: "path" as const,
      pathPattern: row.pathPattern!,
      externalPort: null,
    };
  }
  return {
    ...base,
    kind: "port" as const,
    pathPattern: null,
    externalPort: row.externalPort!,
  };
}

function serializeTrafficLog(
  row: typeof schema.tunnelRequestLogs.$inferSelect,
) {
  return {
    id: row.id,
    tunnelId: row.tunnelId,
    organizationId: row.organizationId,
    method: row.method,
    path: row.path,
    statusCode: row.statusCode,
    latencyMs: row.latencyMs,
    sourceIp: row.sourceIp,
    requestHeaders: (row.requestHeaders ?? {}) as Record<string, unknown>,
    responseHeaders: (row.responseHeaders ?? {}) as Record<string, unknown>,
    createdAt: toIso(row.createdAt)!,
  };
}

async function getNetworkInOrg(networkId: string, organizationId: string) {
  return db.query.networks.findFirst({
    where: and(
      eq(schema.networks.id, networkId),
      eq(schema.networks.organizationId, organizationId),
    ),
  });
}

async function getTunnelInNetwork(
  tunnelId: string,
  networkId: string,
  organizationId: string,
) {
  return db.query.tunnels.findFirst({
    where: and(
      eq(schema.tunnels.id, tunnelId),
      eq(schema.tunnels.networkId, networkId),
      eq(schema.tunnels.organizationId, organizationId),
    ),
  });
}

function deviceLabel(
  name: string | null | undefined,
  metadata: unknown,
  endpointId: string,
): string {
  return deviceDisplayName(name, metadata, endpointId);
}

export const tunnelsRoutes = new Elysia()
  .use(sessionPlugin)
  .use(requireAuth)
  .get(
    "/organizations/:orgId/networks/:networkId/tunnels",
    async ({ authContext, params }) => {
      const auth = getAuth({ authContext });
      const network = await getNetworkInOrg(
        params.networkId,
        auth.organizationId,
      );
      if (!network) return notFound("Network not found");

      const rows = await db
        .select({
          tunnel: schema.tunnels,
          name: schema.devices.name,
          metadata: schema.devices.metadata,
          relayName: schema.relays.name,
        })
        .from(schema.tunnels)
        .innerJoin(
          schema.devices,
          eq(schema.tunnels.endpointId, schema.devices.endpointId),
        )
        .leftJoin(schema.relays, eq(schema.tunnels.relayId, schema.relays.id))
        .where(eq(schema.tunnels.networkId, params.networkId))
        .orderBy(desc(schema.tunnels.createdAt));

      return {
        tunnels: rows.map((r) =>
          serializeTunnel(r.tunnel, {
            hostname: deviceLabel(r.name, r.metadata, r.tunnel.endpointId),
            relayName: r.relayName ?? undefined,
          }),
        ),
      };
    },
  )
  .get(
    "/organizations/:orgId/networks/:networkId/tunnels/:tunnelId",
    async ({ authContext, params }) => {
      const auth = getAuth({ authContext });
      const network = await getNetworkInOrg(
        params.networkId,
        auth.organizationId,
      );
      if (!network) return notFound("Network not found");

      const row = await getTunnelInNetwork(
        params.tunnelId,
        params.networkId,
        auth.organizationId,
      );
      if (!row) return notFound("Tunnel not found");
      return { tunnel: serializeTunnel(row) };
    },
  )
  .get(
    "/organizations/:orgId/networks/:networkId/tunnels/:tunnelId/routing-rules",
    async ({ authContext, params }) => {
      const auth = getAuth({ authContext });
      const tunnel = await getTunnelInNetwork(
        params.tunnelId,
        params.networkId,
        auth.organizationId,
      );
      if (!tunnel) return notFound("Tunnel not found");

      const rows = await db.query.tunnelRoutingRules.findMany({
        where: eq(schema.tunnelRoutingRules.tunnelId, params.tunnelId),
        orderBy: [desc(schema.tunnelRoutingRules.priority)],
      });
      return { routingRules: rows.map(serializeRoutingRule) };
    },
  )
  .get(
    "/organizations/:orgId/networks/:networkId/tunnels/:tunnelId/traffic",
    async ({ authContext, params, query }) => {
      const auth = getAuth({ authContext });
      const tunnel = await getTunnelInNetwork(
        params.tunnelId,
        params.networkId,
        auth.organizationId,
      );
      if (!tunnel) return notFound("Tunnel not found");

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

      const rows = await db.query.tunnelRequestLogs.findMany({
        where: eq(schema.tunnelRequestLogs.tunnelId, params.tunnelId),
        orderBy: [desc(schema.tunnelRequestLogs.createdAt)],
        limit,
      });
      return { logs: rows.map(serializeTrafficLog) };
    },
  )
  .group("", (app) =>
    app
      .use(requirePermission({ tunnel: ["create", "update", "delete"] }))
      .post(
        "/organizations/:orgId/networks/:networkId/tunnels",
        async ({ authContext, params, body }) => {
          const auth = getAuth({ authContext });
          const parsed = createTunnelBody.parse(body);
          const network = await getNetworkInOrg(
            params.networkId,
            auth.organizationId,
          );
          if (!network) return notFound("Network not found");

          const membership = await db.query.networkMemberships.findFirst({
            where: and(
              eq(schema.networkMemberships.endpointId, parsed.endpointId),
              eq(schema.networkMemberships.networkId, params.networkId),
              eq(schema.networkMemberships.status, "active"),
            ),
          });
          if (!membership) return notFound("Machine not in this network");

          const device = await db.query.devices.findFirst({
            where: eq(schema.devices.endpointId, parsed.endpointId),
          });
          if (!device) return notFound("Machine not found");

          const settings = await db.query.organizationTunnelSettings.findFirst({
            where: eq(
              schema.organizationTunnelSettings.organizationId,
              auth.organizationId,
            ),
          });

          const maxTunnels = settings?.maxTunnelsPerMachine ?? 10;
          const [{ value: activeCount }] = await db
            .select({ value: sql<number>`count(*)::int` })
            .from(schema.tunnels)
            .where(
              and(
                eq(schema.tunnels.endpointId, parsed.endpointId),
                inArray(schema.tunnels.status, ["active", "connecting"]),
              ),
            );
          if ((activeCount ?? 0) >= maxTunnels) {
            return conflict(
              `Machine already has ${activeCount} tunnels (limit ${maxTunnels} per machine)`,
            );
          }

          let relay = parsed.relayId
            ? await db.query.relays.findFirst({
                where: and(
                  eq(schema.relays.id, parsed.relayId),
                  eq(schema.relays.organizationId, auth.organizationId),
                  inArray(schema.relays.status, ["healthy", "pending"]),
                ),
              })
            : await db.query.relays.findFirst({
                where: and(
                  eq(schema.relays.organizationId, auth.organizationId),
                  eq(schema.relays.status, "healthy"),
                ),
                orderBy: [desc(schema.relays.lastHeartbeatAt)],
              });

          if (!relay && settings?.defaultRelayId) {
            relay = await db.query.relays.findFirst({
              where: and(
                eq(schema.relays.id, settings.defaultRelayId),
                eq(schema.relays.organizationId, auth.organizationId),
                inArray(schema.relays.status, ["healthy", "pending"]),
              ),
            });
          }

          if (!relay) {
            return conflict(
              "No healthy relay available. Register a relay before opening tunnels.",
            );
          }
          if (!relay.publicKey) {
            return conflict(
              "Relay has not registered yet (missing public key). Register the relay before opening tunnels.",
            );
          }

          const host = deviceLabel(
            device.name,
            device.metadata,
            device.endpointId,
          )
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40);
          const subdomain = parsed.subdomain ?? (host || "app");
          const orgSlug = auth.organizationId.slice(0, 8);
          const baseDomain =
            settings?.customTunnelDomain?.trim() ||
            relay.domain ||
            `${orgSlug}.tunnet.pub`;
          const publicHostname = `${subdomain}.${baseDomain}`;

          const authToken = randomBytes(32).toString("base64url");
          const relayAuthHash = await blake3(Buffer.from(authToken));
          const ttlSeconds =
            parsed.ttlSeconds ?? settings?.defaultTtlSeconds ?? undefined;
          const expiresAt = ttlSeconds
            ? new Date(Date.now() + ttlSeconds * 1000)
            : null;

          let basicAuthUser: string | null = null;
          let basicAuthPasswordHash: string | null = null;
          if (parsed.basicAuth) {
            basicAuthUser = parsed.basicAuth.username;
            basicAuthPasswordHash = await argon2.hash(
              parsed.basicAuth.password,
            );
          }

          let tunnel: typeof schema.tunnels.$inferSelect;
          try {
            tunnel = await db.transaction(async (tx) => {
              const [created] = await tx
                .insert(schema.tunnels)
                .values({
                  organizationId: auth.organizationId,
                  networkId: params.networkId,
                  endpointId: parsed.endpointId,
                  relayId: relay.id,
                  localPort: parsed.localPort,
                  protocol: parsed.protocol,
                  subdomain,
                  publicHostname,
                  status: "connecting",
                  relayAuthHash,
                  expiresAt,
                  basicAuthUser,
                  basicAuthPasswordHash,
                })
                .returning();

              await tx.insert(schema.tunnelSecrets).values({
                tunnelId: created?.id,
                relayAuthToken: authToken,
              });

              await bumpNetworkAndNotify(
                tx,
                params.networkId,
                auth.organizationId,
              );

              await notifyEntityChanged(tx, {
                organizationId: auth.organizationId,
                kind: "tunnel",
                entityId: created?.id,
                networkId: params.networkId,
              });

              await writeAudit(tx, {
                organizationId: auth.organizationId,
                actor: auth.user.id,
                action: "tunnel.create",
                target: created?.id,
                metadata: {
                  publicHostname,
                  endpointId: parsed.endpointId,
                  localPort: parsed.localPort,
                  basicAuth: Boolean(basicAuthUser),
                },
              });

              return created!;
            });
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            if (
              /tunnels_organization_subdomain_unique|unique.*subdomain|duplicate key/i.test(
                message,
              )
            ) {
              const suggestion = suggestSubdomain(subdomain);
              return conflict(
                `Subdomain already in use. Try "${suggestion}" instead.`,
              );
            }
            throw e;
          }

          try {
            const routingRows = await db
              .select()
              .from(schema.tunnelRoutingRules)
              .where(
                and(
                  eq(schema.tunnelRoutingRules.tunnelId, tunnel.id),
                  eq(schema.tunnelRoutingRules.kind, "path"),
                ),
              )
              .orderBy(desc(schema.tunnelRoutingRules.priority));
            const redirectRules = await Promise.all(
              routingRows.map(async (r) => ({
                pathPattern: r.pathPattern!,
                targetPort: r.targetPort,
                targetIp:
                  (await resolveTargetIpv4(
                    params.networkId,
                    r.targetEndpointId,
                  )) ?? undefined,
              })),
            );
            await pushOpenTunnel({
              endpointId: parsed.endpointId,
              tunnelId: tunnel.id,
              relayAddr: relay.publicKey,
              subdomain,
              publicHostname,
              localPort: parsed.localPort,
              protocol: parsed.protocol,
              authToken,
              redirectRules,
            });
          } catch (e) {
            const message =
              e instanceof Error ? e.message : "pushOpenTunnel failed";
            console.error("pushOpenTunnel failed", e);
            const [errored] = await db
              .update(schema.tunnels)
              .set({
                status: "error",
                errorMessage: message,
                updatedAt: new Date(),
              })
              .where(eq(schema.tunnels.id, tunnel.id))
              .returning();
            return {
              tunnel: serializeTunnel(errored ?? tunnel, {
                hostname: deviceLabel(
                  device.name,
                  device.metadata,
                  device.endpointId,
                ),
                relayName: relay.name,
              }),
              relayAuthToken: authToken,
            };
          }

          return {
            tunnel: serializeTunnel(tunnel, {
              hostname: deviceLabel(
                device.name,
                device.metadata,
                device.endpointId,
              ),
              relayName: relay.name,
            }),
            relayAuthToken: authToken,
          };
        },
      )
      .patch(
        "/organizations/:orgId/networks/:networkId/tunnels/:tunnelId",
        async ({ authContext, params, body }) => {
          const auth = getAuth({ authContext });
          const parsed = patchTunnelBody.parse(body);
          const existing = await getTunnelInNetwork(
            params.tunnelId,
            params.networkId,
            auth.organizationId,
          );
          if (!existing) return notFound("Tunnel not found");

          let relayDomain: string | null = null;
          if (parsed.relayId !== undefined && parsed.relayId !== null) {
            const relay = await db.query.relays.findFirst({
              where: and(
                eq(schema.relays.id, parsed.relayId),
                eq(schema.relays.organizationId, auth.organizationId),
              ),
            });
            if (!relay) return notFound("Relay not found");
            relayDomain = relay.domain;
          }

          const subdomain = parsed.subdomain ?? existing.subdomain;
          let publicHostname = existing.publicHostname;
          if (parsed.subdomain || parsed.relayId !== undefined) {
            const relayId =
              parsed.relayId !== undefined ? parsed.relayId : existing.relayId;
            if (relayId && !relayDomain) {
              const relay = await db.query.relays.findFirst({
                where: eq(schema.relays.id, relayId),
              });
              relayDomain = relay?.domain ?? null;
            }
            const fromExisting = existing.publicHostname
              .split(".")
              .slice(1)
              .join(".");
            const base =
              relayDomain ??
              (fromExisting || `${auth.organizationId.slice(0, 8)}.tunnet.pub`);
            publicHostname = `${subdomain}.${base}`;
          }

          const expiresAt =
            parsed.ttlSeconds === undefined
              ? undefined
              : parsed.ttlSeconds === null
                ? null
                : new Date(Date.now() + parsed.ttlSeconds * 1000);

          let basicAuthUser: string | null | undefined;
          let basicAuthPasswordHash: string | null | undefined;
          if (parsed.basicAuth === null) {
            basicAuthUser = null;
            basicAuthPasswordHash = null;
          } else if (parsed.basicAuth !== undefined) {
            basicAuthUser = parsed.basicAuth.username;
            basicAuthPasswordHash = await argon2.hash(
              parsed.basicAuth.password,
            );
          }

          let updated: typeof schema.tunnels.$inferSelect;
          try {
            const [row] = await db
              .update(schema.tunnels)
              .set({
                ...(parsed.localPort !== undefined
                  ? { localPort: parsed.localPort }
                  : {}),
                ...(parsed.subdomain !== undefined ||
                parsed.relayId !== undefined
                  ? { subdomain, publicHostname }
                  : {}),
                ...(parsed.relayId !== undefined
                  ? { relayId: parsed.relayId }
                  : {}),
                ...(expiresAt !== undefined ? { expiresAt } : {}),
                ...(parsed.status !== undefined
                  ? { status: parsed.status, errorMessage: null }
                  : {}),
                ...(basicAuthUser !== undefined
                  ? { basicAuthUser, basicAuthPasswordHash }
                  : {}),
                updatedAt: new Date(),
              })
              .where(eq(schema.tunnels.id, params.tunnelId))
              .returning();
            updated = row!;
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            if (
              /tunnels_organization_subdomain_unique|unique.*subdomain|duplicate key/i.test(
                message,
              )
            ) {
              const suggestion = suggestSubdomain(subdomain);
              return conflict(
                `Subdomain already in use. Try "${suggestion}" instead.`,
              );
            }
            throw e;
          }

          await bumpNetworkAndNotify(db, params.networkId, auth.organizationId);
          await notifyEntityChanged(db, {
            organizationId: auth.organizationId,
            kind: "tunnel",
            entityId: params.tunnelId,
            networkId: params.networkId,
          });
          await writeAudit(db, {
            organizationId: auth.organizationId,
            actor: auth.user.id,
            action: "tunnel.update",
            target: params.tunnelId,
            metadata: {
              ...parsed,
              basicAuth:
                parsed.basicAuth === null
                  ? null
                  : parsed.basicAuth
                    ? { username: parsed.basicAuth.username }
                    : undefined,
            },
          });

          if (parsed.status === "stopped") {
            try {
              await pushStopTunnel({
                endpointId: existing.endpointId,
                tunnelId: params.tunnelId,
              });
            } catch (e) {
              console.error("pushStopTunnel failed", e);
            }
          }

          return { tunnel: serializeTunnel(updated!) };
        },
      )
      .delete(
        "/organizations/:orgId/networks/:networkId/tunnels/:tunnelId",
        async ({ authContext, params }) => {
          const auth = getAuth({ authContext });
          const network = await getNetworkInOrg(
            params.networkId,
            auth.organizationId,
          );
          if (!network) return notFound("Network not found");

          const existing = await getTunnelInNetwork(
            params.tunnelId,
            params.networkId,
            auth.organizationId,
          );
          if (!existing) return notFound("Tunnel not found");

          await db.transaction(async (tx) => {
            await tx
              .update(schema.tunnels)
              .set({ status: "stopped", updatedAt: new Date() })
              .where(eq(schema.tunnels.id, params.tunnelId));

            await bumpNetworkAndNotify(
              tx,
              params.networkId,
              auth.organizationId,
            );

            await notifyEntityChanged(tx, {
              organizationId: auth.organizationId,
              kind: "tunnel",
              entityId: params.tunnelId,
              networkId: params.networkId,
            });

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "tunnel.destroy",
              target: params.tunnelId,
              metadata: { publicHostname: existing.publicHostname },
            });
          });

          try {
            await pushStopTunnel({
              endpointId: existing.endpointId,
              tunnelId: params.tunnelId,
            });
          } catch (e) {
            console.error("pushStopTunnel failed", e);
          }

          return { ok: true };
        },
      )
      .post(
        "/organizations/:orgId/networks/:networkId/tunnels/:tunnelId/routing-rules",
        async ({ authContext, params, body, set }) => {
          const auth = getAuth({ authContext });
          const parsed = createTunnelRoutingRuleBody.parse(body);
          const tunnel = await getTunnelInNetwork(
            params.tunnelId,
            params.networkId,
            auth.organizationId,
          );
          if (!tunnel) return notFound("Tunnel not found");

          if (
            (tunnel.protocol === "https" && parsed.kind !== "path") ||
            (tunnel.protocol === "tcp" && parsed.kind !== "port")
          ) {
            set.status = 400;
            return {
              error:
                tunnel.protocol === "https"
                  ? "HTTPS tunnels only support path routing rules"
                  : "TCP tunnels only support port routing rules",
            };
          }

          try {
            const [created] = await db
              .insert(schema.tunnelRoutingRules)
              .values(
                parsed.kind === "path"
                  ? {
                      tunnelId: params.tunnelId,
                      organizationId: auth.organizationId,
                      kind: "path" as const,
                      pathPattern: parsed.pathPattern,
                      externalPort: null,
                      targetPort: parsed.targetPort,
                      targetEndpointId: parsed.targetEndpointId ?? null,
                      priority: parsed.priority,
                    }
                  : {
                      tunnelId: params.tunnelId,
                      organizationId: auth.organizationId,
                      kind: "port" as const,
                      pathPattern: null,
                      externalPort: parsed.externalPort,
                      targetPort: parsed.targetPort,
                      targetEndpointId: parsed.targetEndpointId ?? null,
                      priority: parsed.priority,
                    },
              )
              .returning();

            await writeAudit(db, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "tunnel.routing_rule.create",
              target: created?.id,
              metadata: { tunnelId: params.tunnelId, ...parsed },
            });

            return { routingRule: serializeRoutingRule(created!) };
          } catch (e) {
            const msg = e instanceof Error ? e.message : "";
            if (
              msg.includes("tunnel_routing_rules_tunnel_path_unique") ||
              msg.includes("tunnel_routing_rules_tunnel_port_unique")
            ) {
              set.status = 409;
              return {
                error:
                  parsed.kind === "path"
                    ? "Path pattern already exists on this tunnel"
                    : "External port already mapped on this tunnel",
              };
            }
            throw e;
          }
        },
      )
      .patch(
        "/organizations/:orgId/networks/:networkId/tunnels/:tunnelId/routing-rules/:ruleId",
        async ({ authContext, params, body, set }) => {
          const auth = getAuth({ authContext });
          const parsed = patchTunnelRoutingRuleBody.parse(body);
          const existing = await db.query.tunnelRoutingRules.findFirst({
            where: and(
              eq(schema.tunnelRoutingRules.id, params.ruleId),
              eq(schema.tunnelRoutingRules.tunnelId, params.tunnelId),
              eq(schema.tunnelRoutingRules.organizationId, auth.organizationId),
            ),
          });
          if (!existing) return notFound("Routing rule not found");

          try {
            const [updated] = await db
              .update(schema.tunnelRoutingRules)
              .set({
                ...(parsed.pathPattern !== undefined
                  ? { pathPattern: parsed.pathPattern }
                  : {}),
                ...(parsed.externalPort !== undefined
                  ? { externalPort: parsed.externalPort }
                  : {}),
                ...(parsed.targetPort !== undefined
                  ? { targetPort: parsed.targetPort }
                  : {}),
                ...(parsed.targetEndpointId !== undefined
                  ? { targetEndpointId: parsed.targetEndpointId }
                  : {}),
                ...(parsed.priority !== undefined
                  ? { priority: parsed.priority }
                  : {}),
                updatedAt: new Date(),
              })
              .where(eq(schema.tunnelRoutingRules.id, params.ruleId))
              .returning();

            return { routingRule: serializeRoutingRule(updated!) };
          } catch (e) {
            const msg = e instanceof Error ? e.message : "";
            if (
              msg.includes("tunnel_routing_rules_tunnel_path_unique") ||
              msg.includes("tunnel_routing_rules_tunnel_port_unique")
            ) {
              set.status = 409;
              return { error: "Routing rule conflict on this tunnel" };
            }
            throw e;
          }
        },
      )
      .delete(
        "/organizations/:orgId/networks/:networkId/tunnels/:tunnelId/routing-rules/:ruleId",
        async ({ authContext, params }) => {
          const auth = getAuth({ authContext });
          const existing = await db.query.tunnelRoutingRules.findFirst({
            where: and(
              eq(schema.tunnelRoutingRules.id, params.ruleId),
              eq(schema.tunnelRoutingRules.tunnelId, params.tunnelId),
              eq(schema.tunnelRoutingRules.organizationId, auth.organizationId),
            ),
          });
          if (!existing) return notFound("Routing rule not found");

          await db
            .delete(schema.tunnelRoutingRules)
            .where(eq(schema.tunnelRoutingRules.id, params.ruleId));

          return { ok: true };
        },
      ),
  );
