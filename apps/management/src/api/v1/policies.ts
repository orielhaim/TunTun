import {
  createPolicyBody,
  patchPolicyBody,
  type Selector,
} from "@tuntun/api/management";
import { schema } from "@tuntun/db";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { writeAudit } from "../../lib/audit";
import { db } from "../../lib/db";
import { bumpNetworkAndNotify } from "../../lib/notify";
import { toIso } from "../../lib/serialize";
import { getAuth, requireAdmin, requireAuth } from "./middleware/authz";
import { notFound, sessionPlugin } from "./middleware/session";

function serializePolicy(row: typeof schema.policies.$inferSelect) {
  return {
    id: row.id,
    networkId: row.networkId,
    srcSelector: row.srcSelector as Selector,
    dstSelector: row.dstSelector as Selector,
    action: row.action as "allow" | "deny",
    ports: row.ports as { start: number; end: number }[],
    protocol: row.protocol as "tcp" | "udp" | "icmp" | "any" | null,
    priority: row.priority,
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

export const policiesRoutes = new Elysia()
  .use(sessionPlugin)
  .use(requireAuth)
  .get(
    "/organizations/:orgId/networks/:networkId/policies",
    async ({ authContext, params }) => {
      const auth = getAuth({ authContext });
      const network = await getNetworkInOrg(
        params.networkId,
        auth.organizationId,
      );
      if (!network) return notFound("Network not found");

      const rows = await db.query.policies.findMany({
        where: eq(schema.policies.networkId, params.networkId),
      });
      return { policies: rows.map(serializePolicy) };
    },
  )
  .group("", (app) =>
    app
      .use(requireAdmin)
      .post(
        "/organizations/:orgId/networks/:networkId/policies",
        async ({ authContext, params, body }) => {
          const auth = getAuth({ authContext });
          const parsed = createPolicyBody.parse(body);
          const network = await getNetworkInOrg(
            params.networkId,
            auth.organizationId,
          );
          if (!network) return notFound("Network not found");

          const row = await db.transaction(async (tx) => {
            const [created] = await tx
              .insert(schema.policies)
              .values({
                networkId: params.networkId,
                srcSelector: parsed.srcSelector,
                dstSelector: parsed.dstSelector,
                action: parsed.action,
                ports: parsed.ports,
                protocol: parsed.protocol ?? null,
                priority: parsed.priority,
              })
              .returning();

            if (!created) {
              throw new Error("Failed to create policy");
            }

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "policy.created",
              target: created.id,
            });

            await bumpNetworkAndNotify(
              tx,
              params.networkId,
              auth.organizationId,
            );
            return created;
          });

          return serializePolicy(row);
        },
      ),
  )
  .group("", (app) =>
    app
      .use(requireAdmin)
      .patch(
        "/organizations/:orgId/networks/:networkId/policies/:policyId",
        async ({ authContext, params, body }) => {
          const auth = getAuth({ authContext });
          const parsed = patchPolicyBody.parse(body);
          const network = await getNetworkInOrg(
            params.networkId,
            auth.organizationId,
          );
          if (!network) return notFound("Network not found");

          const row = await db.transaction(async (tx) => {
            const [updated] = await tx
              .update(schema.policies)
              .set(parsed)
              .where(
                and(
                  eq(schema.policies.id, params.policyId),
                  eq(schema.policies.networkId, params.networkId),
                ),
              )
              .returning();

            if (!updated) {
              throw new Error("Policy not found");
            }

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "policy.updated",
              target: updated.id,
              metadata: parsed,
            });

            await bumpNetworkAndNotify(
              tx,
              params.networkId,
              auth.organizationId,
            );
            return updated;
          });

          return serializePolicy(row);
        },
      ),
  )
  .group("", (app) =>
    app
      .use(requireAdmin)
      .delete(
        "/organizations/:orgId/networks/:networkId/policies/:policyId",
        async ({ authContext, params }) => {
          const auth = getAuth({ authContext });
          const network = await getNetworkInOrg(
            params.networkId,
            auth.organizationId,
          );
          if (!network) return notFound("Network not found");

          await db.transaction(async (tx) => {
            const [deleted] = await tx
              .delete(schema.policies)
              .where(
                and(
                  eq(schema.policies.id, params.policyId),
                  eq(schema.policies.networkId, params.networkId),
                ),
              )
              .returning({ id: schema.policies.id });

            if (!deleted) {
              throw new Error("Policy not found");
            }

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "policy.deleted",
              target: deleted.id,
            });

            await bumpNetworkAndNotify(
              tx,
              params.networkId,
              auth.organizationId,
            );
          });

          return { ok: true };
        },
      ),
  );
