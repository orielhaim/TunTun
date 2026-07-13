import { upsertOrganizationSsoProviderBody } from "@tuntun/api/management";
import { schema } from "@tuntun/db";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";

import { auth } from "../../auth";
import { writeAudit } from "../../lib/audit";
import { db } from "../../lib/db";
import { toIso } from "../../lib/serialize";
import { getAuth, requireAdmin, requireAuth } from "./middleware/authz";
import { notFound, sessionPlugin } from "./middleware/session";

type OidcConfigStored = {
  clientId?: string;
  clientSecret?: string;
  discoveryEndpoint?: string;
  scopes?: string[];
  pkce?: boolean;
};

function parseOidcConfig(raw: string | null): OidcConfigStored {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as OidcConfigStored;
  } catch {
    return {};
  }
}

function serializeProvider(row: typeof schema.ssoProvider.$inferSelect) {
  const oidc = parseOidcConfig(row.oidcConfig);
  return {
    id: row.id,
    providerId: row.providerId,
    issuer: row.issuer,
    domain: row.domain,
    organizationId: row.organizationId,
    configured: Boolean(row.oidcConfig),
    clientId: oidc.clientId ?? null,
    clientSecretSet: Boolean(oidc.clientSecret),
    discoveryEndpoint: oidc.discoveryEndpoint ?? null,
    scopes: oidc.scopes ?? ["openid", "profile", "email"],
    pkce: oidc.pkce ?? true,
  };
}

export const ssoSettingsRoutes = new Elysia()
  .use(sessionPlugin)
  .use(requireAuth)
  .get("/organizations/:orgId/sso-settings", async ({ authContext }) => {
    const authCtx = getAuth({ authContext });
    const row = await db.query.ssoProvider.findFirst({
      where: eq(schema.ssoProvider.organizationId, authCtx.organizationId),
    });
    return { provider: row ? serializeProvider(row) : null };
  })
  .get(
    "/organizations/:orgId/devices/:endpointId/ssh-auth",
    async ({ authContext, params }) => {
      const authCtx = getAuth({ authContext });
      const device = await db.query.devices.findFirst({
        where: and(
          eq(schema.devices.endpointId, params.endpointId),
          eq(schema.devices.organizationId, authCtx.organizationId),
        ),
      });
      if (!device) return notFound("Device not found");

      const check = await db.query.sshAuthChecks.findFirst({
        where: eq(schema.sshAuthChecks.endpointId, params.endpointId),
      });

      return {
        endpointId: params.endpointId,
        authenticatedAt: check ? toIso(check.authenticatedAt) : null,
        method: check?.method ?? null,
        identityEmail: check?.identityEmail ?? null,
      };
    },
  )
  .group("", (app) =>
    app
      .use(requireAdmin)
      .put(
        "/organizations/:orgId/sso-settings",
        async ({ authContext, body, request }) => {
          const authCtx = getAuth({ authContext });
          const parsed = upsertOrganizationSsoProviderBody.parse(body);

          const org = await db.query.organization.findFirst({
            where: eq(schema.organization.id, authCtx.organizationId),
          });
          if (!org) return notFound("Organization not found");

          const existing = await db.query.ssoProvider.findFirst({
            where: eq(
              schema.ssoProvider.organizationId,
              authCtx.organizationId,
            ),
          });

          const providerId =
            parsed.providerId?.trim() ||
            existing?.providerId ||
            `org-${org.slug}`;

          const existingOidc = parseOidcConfig(existing?.oidcConfig ?? null);
          if (!parsed.clientSecret && !existingOidc.clientSecret) {
            return new Response(
              JSON.stringify({
                error: "clientSecret is required when creating SSO settings",
              }),
              { status: 400, headers: { "content-type": "application/json" } },
            );
          }

          const scopes = parsed.scopes ??
            existingOidc.scopes ?? ["openid", "profile", "email"];
          const discoveryEndpoint =
            parsed.discoveryEndpoint !== undefined
              ? parsed.discoveryEndpoint
              : (existingOidc.discoveryEndpoint ?? null);

          if (existing) {
            const secret = parsed.clientSecret ?? existingOidc.clientSecret;
            if (!secret) {
              return new Response(
                JSON.stringify({
                  error: "clientSecret is required when creating SSO settings",
                }),
                {
                  status: 400,
                  headers: { "content-type": "application/json" },
                },
              );
            }
            await auth.api.updateSSOProvider({
              headers: request.headers,
              body: {
                providerId: existing.providerId,
                issuer: parsed.issuer,
                domain: parsed.domain,
                oidcConfig: {
                  clientId: parsed.clientId,
                  clientSecret: secret,
                  ...(discoveryEndpoint ? { discoveryEndpoint } : {}),
                  scopes,
                  pkce: parsed.pkce ?? existingOidc.pkce ?? true,
                },
              },
            });

            await writeAudit(db, {
              organizationId: authCtx.organizationId,
              actor: authCtx.user.id,
              action: "sso_settings.update",
              target: existing.providerId,
              metadata: {
                issuer: parsed.issuer,
                domain: parsed.domain,
                clientId: parsed.clientId,
              },
            });

            const row = await db.query.ssoProvider.findFirst({
              where: eq(schema.ssoProvider.providerId, existing.providerId),
            });
            return { provider: row ? serializeProvider(row) : null };
          }

          const createSecret = parsed.clientSecret;
          if (!createSecret) {
            return new Response(
              JSON.stringify({
                error: "clientSecret is required when creating SSO settings",
              }),
              { status: 400, headers: { "content-type": "application/json" } },
            );
          }

          await auth.api.registerSSOProvider({
            headers: request.headers,
            body: {
              providerId,
              issuer: parsed.issuer,
              domain: parsed.domain,
              organizationId: authCtx.organizationId,
              oidcConfig: {
                clientId: parsed.clientId,
                clientSecret: createSecret,
                ...(discoveryEndpoint ? { discoveryEndpoint } : {}),
                scopes,
                pkce: parsed.pkce ?? true,
              },
            },
          });

          await writeAudit(db, {
            organizationId: authCtx.organizationId,
            actor: authCtx.user.id,
            action: "sso_settings.create",
            target: providerId,
            metadata: {
              issuer: parsed.issuer,
              domain: parsed.domain,
              clientId: parsed.clientId,
            },
          });

          const row = await db.query.ssoProvider.findFirst({
            where: eq(schema.ssoProvider.providerId, providerId),
          });
          return { provider: row ? serializeProvider(row) : null };
        },
      )
      .delete(
        "/organizations/:orgId/sso-settings",
        async ({ authContext, request }) => {
          const authCtx = getAuth({ authContext });
          const existing = await db.query.ssoProvider.findFirst({
            where: eq(
              schema.ssoProvider.organizationId,
              authCtx.organizationId,
            ),
          });
          if (!existing) return notFound("SSO provider not found");

          await auth.api.deleteSSOProvider({
            headers: request.headers,
            body: { providerId: existing.providerId },
          });

          await writeAudit(db, {
            organizationId: authCtx.organizationId,
            actor: authCtx.user.id,
            action: "sso_settings.delete",
            target: existing.providerId,
            metadata: {},
          });

          return { ok: true };
        },
      ),
  );
