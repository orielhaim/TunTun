import {
  createSshPolicyBody,
  patchSshPolicyBody,
  type Selector,
} from "@tunnet/api/management";
import { schema } from "@tunnet/db";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { writeAudit } from "../../lib/audit";
import { db } from "../../lib/db";
import { bumpNetworkAndNotify } from "../../lib/notify";
import { toIso } from "../../lib/serialize";
import { getAuth, requireAuth, requirePermission } from "./middleware/authz";
import { notFound, sessionPlugin } from "./middleware/session";

function serializeSshPolicy(row: typeof schema.sshPolicies.$inferSelect) {
  return {
    id: row.id,
    networkId: row.networkId,
    srcSelector: row.srcSelector as Selector,
    dstSelector: row.dstSelector as Selector,
    action: row.action as "accept" | "check" | "deny",
    users: row.users as string[],
    record: row.record,
    recorder: (row.recorder as Selector | null) ?? null,
    enforceRecorder: row.enforceRecorder,
    checkPeriodSecs: row.checkPeriodSecs,
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

export const sshPoliciesRoutes = new Elysia()
  .use(sessionPlugin)
  .use(requireAuth)
  .get(
    "/organizations/:orgId/networks/:networkId/ssh-policies",
    async ({ authContext, params }) => {
      const auth = getAuth({ authContext });
      const network = await getNetworkInOrg(
        params.networkId,
        auth.organizationId,
      );
      if (!network) return notFound("Network not found");

      const rows = await db.query.sshPolicies.findMany({
        where: eq(schema.sshPolicies.networkId, params.networkId),
      });
      return { policies: rows.map(serializeSshPolicy) };
    },
  )
  .group("", (app) =>
    app
      .use(requirePermission({ policy: ["create"] }))
      .post(
        "/organizations/:orgId/networks/:networkId/ssh-policies",
        async ({ authContext, params, body }) => {
          const auth = getAuth({ authContext });
          const parsed = createSshPolicyBody.parse(body);
          const network = await getNetworkInOrg(
            params.networkId,
            auth.organizationId,
          );
          if (!network) return notFound("Network not found");

          const row = await db.transaction(async (tx) => {
            const [created] = await tx
              .insert(schema.sshPolicies)
              .values({
                networkId: params.networkId,
                srcSelector: parsed.srcSelector,
                dstSelector: parsed.dstSelector,
                action: parsed.action,
                users: parsed.users,
                record: parsed.record,
                recorder: parsed.recorder ?? null,
                enforceRecorder: parsed.enforceRecorder,
                checkPeriodSecs: parsed.checkPeriodSecs ?? null,
                priority: parsed.priority,
              })
              .returning();

            if (!created) {
              throw new Error("Failed to create SSH policy");
            }

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "ssh_policy.created",
              target: created.id,
            });

            await bumpNetworkAndNotify(
              tx,
              params.networkId,
              auth.organizationId,
            );
            return created;
          });

          return serializeSshPolicy(row);
        },
      ),
  )
  .group("", (app) =>
    app
      .use(requirePermission({ policy: ["update"] }))
      .patch(
        "/organizations/:orgId/networks/:networkId/ssh-policies/:policyId",
        async ({ authContext, params, body }) => {
          const auth = getAuth({ authContext });
          const parsed = patchSshPolicyBody.parse(body);
          const network = await getNetworkInOrg(
            params.networkId,
            auth.organizationId,
          );
          if (!network) return notFound("Network not found");

          const row = await db.transaction(async (tx) => {
            const [updated] = await tx
              .update(schema.sshPolicies)
              .set({
                ...(parsed.srcSelector !== undefined
                  ? { srcSelector: parsed.srcSelector }
                  : {}),
                ...(parsed.dstSelector !== undefined
                  ? { dstSelector: parsed.dstSelector }
                  : {}),
                ...(parsed.action !== undefined
                  ? { action: parsed.action }
                  : {}),
                ...(parsed.users !== undefined ? { users: parsed.users } : {}),
                ...(parsed.record !== undefined
                  ? { record: parsed.record }
                  : {}),
                ...(parsed.recorder !== undefined
                  ? { recorder: parsed.recorder }
                  : {}),
                ...(parsed.enforceRecorder !== undefined
                  ? { enforceRecorder: parsed.enforceRecorder }
                  : {}),
                ...(parsed.checkPeriodSecs !== undefined
                  ? { checkPeriodSecs: parsed.checkPeriodSecs }
                  : {}),
                ...(parsed.priority !== undefined
                  ? { priority: parsed.priority }
                  : {}),
              })
              .where(
                and(
                  eq(schema.sshPolicies.id, params.policyId),
                  eq(schema.sshPolicies.networkId, params.networkId),
                ),
              )
              .returning();

            if (!updated) {
              throw new Error("SSH policy not found");
            }

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "ssh_policy.updated",
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

          return serializeSshPolicy(row);
        },
      ),
  )
  .group("", (app) =>
    app
      .use(requirePermission({ policy: ["delete"] }))
      .delete(
        "/organizations/:orgId/networks/:networkId/ssh-policies/:policyId",
        async ({ authContext, params }) => {
          const auth = getAuth({ authContext });
          const network = await getNetworkInOrg(
            params.networkId,
            auth.organizationId,
          );
          if (!network) return notFound("Network not found");

          await db.transaction(async (tx) => {
            const [deleted] = await tx
              .delete(schema.sshPolicies)
              .where(
                and(
                  eq(schema.sshPolicies.id, params.policyId),
                  eq(schema.sshPolicies.networkId, params.networkId),
                ),
              )
              .returning({ id: schema.sshPolicies.id });

            if (!deleted) {
              throw new Error("SSH policy not found");
            }

            await writeAudit(tx, {
              organizationId: auth.organizationId,
              actor: auth.user.id,
              action: "ssh_policy.deleted",
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
