import { createListenClient, schema } from "@tuntun/db";
import { formatIp } from "@tuntun/ip";
import { and, desc, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../../lib/db";
import {
  ENTITY_NOTIFY_CHANNEL,
  PRESENCE_NOTIFY_CHANNEL,
} from "../../lib/notify";
import {
  serializePresenceEvent,
  serializePresencePatch,
} from "../../lib/serialize-device";
import { getAuth, requireAuth } from "./middleware/authz";
import { notFound, sessionPlugin } from "./middleware/session";

export const presenceRoutes = new Elysia()
  .use(sessionPlugin)
  .use(requireAuth)
  .get(
    "/organizations/:orgId/presence/stream",
    ({ authContext, params, request }) => {
      getAuth({ authContext });
      const orgId = params.orgId;
      const encoder = new TextEncoder();
      let listenClient: ReturnType<typeof createListenClient> | null = null;
      let heartbeat: ReturnType<typeof setInterval> | null = null;

      const stream = new ReadableStream({
        start: (controller) => {
          void (async () => {
            const send = (data: unknown) => {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
              );
            };

            send({ type: "ready", organizationId: orgId });

            listenClient = createListenClient();
            await listenClient.listen(
              PRESENCE_NOTIFY_CHANNEL,
              async (payload: string) => {
                try {
                  const parsed = JSON.parse(payload) as {
                    organizationId?: string;
                    endpointId?: string;
                  };
                  if (parsed.organizationId !== orgId || !parsed.endpointId) {
                    return;
                  }

                  const row = await db.query.devices.findFirst({
                    where: and(
                      eq(schema.devices.endpointId, parsed.endpointId),
                      eq(schema.devices.organizationId, orgId),
                    ),
                    with: {
                      memberships: {
                        limit: 1,
                      },
                    },
                  });
                  if (!row) return;

                  const networkId = row.memberships[0]?.networkId;
                  if (!networkId) return;

                  send({
                    type: "presence",
                    patch: serializePresencePatch({
                      ...row,
                      networkId,
                    }),
                  });
                } catch {
                  // ignore malformed payloads
                }
              },
            );

            await listenClient.listen(
              ENTITY_NOTIFY_CHANNEL,
              (payload: string) => {
                try {
                  const parsed = JSON.parse(payload) as {
                    organizationId?: string;
                    kind?: string;
                    entityId?: string;
                    networkId?: string | null;
                  };
                  if (
                    parsed.organizationId !== orgId ||
                    !parsed.kind ||
                    !parsed.entityId
                  ) {
                    return;
                  }
                  send({
                    type: "entity",
                    kind: parsed.kind,
                    entityId: parsed.entityId,
                    networkId: parsed.networkId ?? null,
                  });
                } catch {
                  // ignore malformed payloads
                }
              },
            );

            heartbeat = setInterval(() => {
              try {
                controller.enqueue(encoder.encode(": keepalive\n\n"));
              } catch {
                if (heartbeat) clearInterval(heartbeat);
              }
            }, 25_000);

            request.signal.addEventListener("abort", () => {
              if (heartbeat) clearInterval(heartbeat);
              if (listenClient) {
                void listenClient.end();
                listenClient = null;
              }
              try {
                controller.close();
              } catch {
                // already closed
              }
            });
          })();
        },
        cancel: () => {
          if (heartbeat) clearInterval(heartbeat);
          if (listenClient) {
            void listenClient.end();
            listenClient = null;
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    },
  )
  .get(
    "/organizations/:orgId/devices/:endpointId/presence",
    async ({ authContext, params }) => {
      const auth = getAuth({ authContext });
      const device = await db.query.devices.findFirst({
        where: and(
          eq(schema.devices.endpointId, params.endpointId),
          eq(schema.devices.organizationId, auth.organizationId),
        ),
      });
      if (!device) return notFound("Device not found");

      const events = await db.query.devicePresenceEvents.findMany({
        where: eq(schema.devicePresenceEvents.endpointId, params.endpointId),
        orderBy: desc(schema.devicePresenceEvents.at),
        limit: 100,
      });

      return { events: events.map(serializePresenceEvent) };
    },
  )
  .get(
    "/organizations/:orgId/devices/:endpointId/addresses",
    async ({ authContext, params }) => {
      const auth = getAuth({ authContext });
      const device = await db.query.devices.findFirst({
        where: and(
          eq(schema.devices.endpointId, params.endpointId),
          eq(schema.devices.organizationId, auth.organizationId),
        ),
        with: {
          memberships: {
            with: { network: true },
          },
        },
      });
      if (!device) return notFound("Device not found");

      return {
        endpointId: device.endpointId,
        publicIp: device.publicIp ? formatIp(device.publicIp) : null,
        ipv6Enabled: device.ipv6Enabled,
        tenantIpv6:
          device.ipv6Enabled && device.tenantIpv6
            ? formatIp(device.tenantIpv6)
            : null,
        addresses: device.memberships.map((m) => ({
          networkId: m.networkId,
          networkName: m.network.name,
          assignedIp: formatIp(m.assignedIp),
        })),
      };
    },
  );
