import { schema } from "@tuntun/db";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";

import { writeAudit } from "../../lib/audit";
import { db } from "../../lib/db";
import {
  ensureOrganizationCa,
  rotateOrganizationCa,
} from "../../lib/internal-ca";
import { toIso } from "../../lib/serialize";
import { getAuth, requireAdmin, requireAuth } from "./middleware/authz";
import { sessionPlugin } from "./middleware/session";

function caStatus(
  row: typeof schema.organizationCas.$inferSelect | undefined,
): "healthy" | "expired" | "missing" {
  if (!row) return "missing";
  if (row.notAfter.getTime() <= Date.now()) return "expired";
  return "healthy";
}

export const internalCaRoutes = new Elysia()
  .use(sessionPlugin)
  .use(requireAuth)
  .get("/organizations/:orgId/internal-ca", async ({ authContext }) => {
    const auth = getAuth({ authContext });
    const row = await db.query.organizationCas.findFirst({
      where: eq(schema.organizationCas.organizationId, auth.organizationId),
    });
    const status = caStatus(row);
    return {
      fingerprintSha256: row?.fingerprintSha256 ?? null,
      notBefore: toIso(row?.notBefore ?? null),
      notAfter: toIso(row?.notAfter ?? null),
      status,
      rotatedAt: toIso(row?.rotatedAt ?? null),
    };
  })
  .group("", (app) =>
    app
      .use(requireAdmin)
      .post(
        "/organizations/:orgId/internal-ca/rotate",
        async ({ authContext }) => {
          const auth = getAuth({ authContext });

          await ensureOrganizationCa(auth.organizationId);
          const rotated = await rotateOrganizationCa(auth.organizationId);

          await writeAudit(db, {
            organizationId: auth.organizationId,
            actor: auth.user.id,
            action: "internal_ca.rotate",
            target: auth.organizationId,
            metadata: { fingerprintSha256: rotated.fingerprintSha256 },
          });

          return {
            fingerprintSha256: rotated.fingerprintSha256,
            notBefore: toIso(rotated.notBefore)!,
            notAfter: toIso(rotated.notAfter)!,
            status: "healthy" as const,
            rotatedAt: toIso(rotated.rotatedAt)!,
          };
        },
      ),
  );
