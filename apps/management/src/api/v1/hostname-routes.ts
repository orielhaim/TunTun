import {
  createHostnameRouteBody,
  formatHostnameLabel,
  parseHostnameInput,
  patchHostnameRouteBody,
} from "@tuntun/api/management";
import { schema } from "@tuntun/db";
import { formatIp } from "@tuntun/ip";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { writeAudit } from "../../lib/audit";
import { db } from "../../lib/db";
import { bumpNetworkAndNotify } from "../../lib/notify";
import { toIso } from "../../lib/serialize";
import { getAuth, requireAdmin, requireAuth } from "./middleware/authz";
import { notFound, sessionPlugin } from "./middleware/session";

function serializeRoute(
  row: typeof schema.hostnameRoutes.$inferSelect,
  extras?: { hostnameLabel?: string; viaIp?: string },
) {
  return {
    id: row.id,
    endpointId: row.endpointId,
    networkId: row.networkId,
    hostname: row.hostname,
    isWildcard: row.isWildcard,
    targetIp: row.targetIp,
    description: row.description,
    enabled: row.enabled,
    createdAt: toIso(row.createdAt)!,
    hostnameLabel:
      extras?.hostnameLabel ??
      formatHostnameLabel(row.hostname, row.isWildcard),
    viaIp: extras?.viaIp,
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

export const hostnameRoutesRoutes = new Elysia()
  .use(sessionPlugin)
  .use(requireAuth)
  .get(
    "/organizations/:orgId/networks/:networkId/hostname-routes",
    async ({ authContext, params }) => {
      const auth = getAuth({ authContext });
      const network = await getNetworkInOrg(
        params.networkId,
        auth.organizationId,
      );
      if (!network) return notFound("Network not found");

      const rows = await db
        .select({
          route: schema.hostnameRoutes,
          assignedIp: schema.networkMemberships.assignedIp,
        })
        .from(schema.hostnameRoutes)
        .innerJoin(
          schema.devices,
          eq(schema.hostnameRoutes.endpointId, schema.devices.endpointId),
        )
        .leftJoin(
          schema.networkMemberships,
          and(
            eq(
              schema.networkMemberships.endpointId,
              schema.hostnameRoutes.endpointId,
            ),
            eq(
              schema.networkMemberships.networkId,
              schema.hostnameRoutes.networkId,
            ),
          ),
        )
        .where(eq(schema.hostnameRoutes.networkId, params.networkId));

      return {
        routes: rows.map(({ route, assignedIp }) => {
          return serializeRoute(route, {
            viaIp: assignedIp ?? undefined,
            hostnameLabel: formatHostnameLabel(
              route.hostname,
              route.isWildcard,
            ),
          });
        }),
      };
    },
  )
  .group("", (app) =>
    app
      .use(requireAdmin)
      .post(
        "/organizations/:orgId/networks/:networkId/hostname-routes",
        async ({ authContext, params, body, set }) => {
          const auth = getAuth({ authContext });
          const parsed = createHostnameRouteBody.parse(body);
          const network = await getNetworkInOrg(
            params.networkId,
            auth.organizationId,
          );
          if (!network) return notFound("Network not found");

          const { hostname, isWildcard } = parseHostnameInput(parsed.hostname);
          if (!hostname) {
            set.status = 400;
            return { error: "Invalid hostname" };
          }

          const membership = await db.query.networkMemberships.findFirst({
            where: and(
              eq(schema.networkMemberships.endpointId, parsed.endpointId),
              eq(schema.networkMemberships.networkId, params.networkId),
            ),
          });
          if (!membership) {
            set.status = 400;
            return { error: "Device is not a member of this network" };
          }

          const targetIp = parsed.targetIp ? formatIp(parsed.targetIp) : null;

          try {
            const row = await db.transaction(async (tx) => {
              const [created] = await tx
                .insert(schema.hostnameRoutes)
                .values({
                  endpointId: parsed.endpointId,
                  networkId: params.networkId,
                  hostname,
                  isWildcard,
                  targetIp,
                  description: parsed.description ?? null,
                  enabled: parsed.enabled,
                })
                .returning();

              if (!created) throw new Error("Failed to create hostname route");

              await writeAudit(tx, {
                organizationId: auth.organizationId,
                actor: auth.user.id,
                action: "hostname_route.created",
                target: created.id,
                metadata: {
                  networkId: params.networkId,
                  endpointId: parsed.endpointId,
                  hostname: formatHostnameLabel(hostname, isWildcard),
                },
              });

              await bumpNetworkAndNotify(
                tx,
                params.networkId,
                auth.organizationId,
              );

              return created;
            });

            return serializeRoute(row, {
              viaIp: membership.assignedIp,
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            if (message.includes("hostname_routes_network_hostname_unique")) {
              set.status = 409;
              return {
                error: `Hostname ${formatHostnameLabel(hostname, isWildcard)} already exists`,
              };
            }
            throw err;
          }
        },
      )
      .patch(
        "/organizations/:orgId/networks/:networkId/hostname-routes/:routeId",
        async ({ authContext, params, body }) => {
          const auth = getAuth({ authContext });
          const parsed = patchHostnameRouteBody.parse(body);
          const network = await getNetworkInOrg(
            params.networkId,
            auth.organizationId,
          );
          if (!network) return notFound("Network not found");

          const updated = await db.transaction(async (tx) => {
            const [row] = await tx
              .update(schema.hostnameRoutes)
              .set({
                ...(parsed.targetIp !== undefined
                  ? {
                      targetIp:
                        parsed.targetIp === null
                          ? null
                          : formatIp(parsed.targetIp),
                    }
                  : {}),
                ...(parsed.description !== undefined
                  ? { description: parsed.description }
                  : {}),
                ...(parsed.enabled !== undefined
                  ? { enabled: parsed.enabled }
                  : {}),
              })
              .where(
                and(
                  eq(schema.hostnameRoutes.id, params.routeId),
                  eq(schema.hostnameRoutes.networkId, params.networkId),
                ),
              )
              .returning();

            if (!row) return null;

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "hostname_route.updated",
              target: row.id,
              metadata: parsed,
            });

            await bumpNetworkAndNotify(
              tx,
              params.networkId,
              auth.organizationId,
            );

            return row;
          });

          if (!updated) return notFound("Hostname route not found");
          return serializeRoute(updated);
        },
      )
      .delete(
        "/organizations/:orgId/networks/:networkId/hostname-routes/:routeId",
        async ({ authContext, params }) => {
          const auth = getAuth({ authContext });
          const network = await getNetworkInOrg(
            params.networkId,
            auth.organizationId,
          );
          if (!network) return notFound("Network not found");

          const deleted = await db.transaction(async (tx) => {
            const [row] = await tx
              .delete(schema.hostnameRoutes)
              .where(
                and(
                  eq(schema.hostnameRoutes.id, params.routeId),
                  eq(schema.hostnameRoutes.networkId, params.networkId),
                ),
              )
              .returning();

            if (!row) return null;

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "hostname_route.deleted",
              target: row.id,
              metadata: {
                networkId: params.networkId,
                hostname: formatHostnameLabel(row.hostname, row.isWildcard),
              },
            });

            await bumpNetworkAndNotify(
              tx,
              params.networkId,
              auth.organizationId,
            );

            return row;
          });

          if (!deleted) return notFound("Hostname route not found");
          return { ok: true as const };
        },
      ),
  );
