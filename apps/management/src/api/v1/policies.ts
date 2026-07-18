import {
  createPolicyBody,
  patchPolicyBody,
  type Selector,
} from "@tunnet/api/management";
import { schema } from "@tunnet/db";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { writeAudit } from "../../lib/audit";
import { db } from "../../lib/db";
import { bumpNetworkAndNotify, bumpOrgAndNotify } from "../../lib/notify";
import { toIso } from "../../lib/serialize";
import { getAuth, requireAuth, requirePermission } from "./middleware/authz";
import { notFound, sessionPlugin } from "./middleware/session";

function serializePolicy(row: typeof schema.policies.$inferSelect) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    networkId: row.networkId,
    scope: row.scope as "network" | "organization",
    srcSelector: row.srcSelector as Selector,
    dstSelector: row.dstSelector as Selector,
    action: row.action as "allow" | "deny",
    ports: row.ports as { start: number; end: number }[],
    protocol: row.protocol as "tcp" | "udp" | "icmp" | "any" | null,
    priority: row.priority,
    srcPosture: row.srcPosture ?? null,
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
        where: and(
          eq(schema.policies.networkId, params.networkId),
          eq(schema.policies.organizationId, auth.organizationId),
          eq(schema.policies.scope, "network"),
        ),
      });
      return { policies: rows.map(serializePolicy) };
    },
  )
  .get("/organizations/:orgId/policies", async ({ authContext }) => {
    const auth = getAuth({ authContext });
    const rows = await db.query.policies.findMany({
      where: and(
        eq(schema.policies.organizationId, auth.organizationId),
        eq(schema.policies.scope, "organization"),
      ),
    });
    return { policies: rows.map(serializePolicy) };
  })
  .group("", (app) =>
    app
      .use(requirePermission({ policy: ["create"] }))
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
                organizationId: auth.organizationId,
                networkId: params.networkId,
                scope: "network",
                srcSelector: parsed.srcSelector,
                dstSelector: parsed.dstSelector,
                action: parsed.action,
                ports: parsed.ports,
                protocol: parsed.protocol ?? null,
                priority: parsed.priority,
                srcPosture: parsed.srcPosture ?? null,
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
      )
      .post("/organizations/:orgId/policies", async ({ authContext, body }) => {
        const auth = getAuth({ authContext });
        const parsed = createPolicyBody.parse(body);

        const row = await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(schema.policies)
            .values({
              organizationId: auth.organizationId,
              networkId: null,
              scope: "organization",
              srcSelector: parsed.srcSelector,
              dstSelector: parsed.dstSelector,
              action: parsed.action,
              ports: parsed.ports,
              protocol: parsed.protocol ?? null,
              priority: parsed.priority,
              srcPosture: parsed.srcPosture ?? null,
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
            metadata: { scope: "organization" },
          });

          await bumpOrgAndNotify(tx, auth.organizationId);
          return created;
        });

        return serializePolicy(row);
      }),
  )
  .group("", (app) =>
    app
      .use(requirePermission({ policy: ["update"] }))
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
                  eq(schema.policies.organizationId, auth.organizationId),
                  eq(schema.policies.scope, "network"),
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
      )
      .patch(
        "/organizations/:orgId/policies/:policyId",
        async ({ authContext, params, body }) => {
          const auth = getAuth({ authContext });
          const parsed = patchPolicyBody.parse(body);

          const row = await db.transaction(async (tx) => {
            const [updated] = await tx
              .update(schema.policies)
              .set(parsed)
              .where(
                and(
                  eq(schema.policies.id, params.policyId),
                  eq(schema.policies.organizationId, auth.organizationId),
                  eq(schema.policies.scope, "organization"),
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
              metadata: { ...parsed, scope: "organization" },
            });

            await bumpOrgAndNotify(tx, auth.organizationId);
            return updated;
          });

          return serializePolicy(row);
        },
      ),
  )
  .group("", (app) =>
    app
      .use(requirePermission({ policy: ["delete"] }))
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
                  eq(schema.policies.organizationId, auth.organizationId),
                  eq(schema.policies.scope, "network"),
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
      )
      .delete(
        "/organizations/:orgId/policies/:policyId",
        async ({ authContext, params }) => {
          const auth = getAuth({ authContext });

          await db.transaction(async (tx) => {
            const [deleted] = await tx
              .delete(schema.policies)
              .where(
                and(
                  eq(schema.policies.id, params.policyId),
                  eq(schema.policies.organizationId, auth.organizationId),
                  eq(schema.policies.scope, "organization"),
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
              metadata: { scope: "organization" },
            });

            await bumpOrgAndNotify(tx, auth.organizationId);
          });

          return { ok: true };
        },
      ),
  );
