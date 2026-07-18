import { createHash, randomBytes } from "node:crypto";
import {
  type Oauth2ClientCredentialsTokenResponse,
  oauth2ClientCredentialsTokenRequest,
} from "@tunnet/api/management";
import { schema } from "@tunnet/db";
import * as argon2 from "argon2";
import { and, eq, isNull } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../../lib/db";

const TOKEN_TTL_SECS = 3600;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const authOauthRoutes = new Elysia().post(
  "/auth/token",
  async ({ body, set }) => {
    const parsed = oauth2ClientCredentialsTokenRequest.safeParse(body);
    if (!parsed.success) {
      set.status = 400;
      return {
        error: "invalid_request",
        error_description: parsed.error.message,
      };
    }

    const clients = await db
      .select()
      .from(schema.oauthClients)
      .where(
        and(
          eq(schema.oauthClients.clientId, parsed.data.client_id),
          isNull(schema.oauthClients.revokedAt),
        ),
      )
      .limit(1);
    const client = clients[0];
    if (!client) {
      set.status = 401;
      return { error: "invalid_client" };
    }

    const ok = await argon2.verify(
      client.hashedSecret,
      parsed.data.client_secret,
    );
    if (!ok) {
      set.status = 401;
      return { error: "invalid_client" };
    }

    let scopes = client.scopes;
    if (parsed.data.scope) {
      const requested = parsed.data.scope.split(/\s+/).filter(Boolean);
      scopes = requested.filter((s) => client.scopes.includes(s));
    }

    const accessToken = `tt_oauth_${randomBytes(32).toString("base64url")}`;
    const expiresAt = new Date(Date.now() + TOKEN_TTL_SECS * 1000);

    await db.insert(schema.oauthAccessTokens).values({
      clientId: client.id,
      organizationId: client.organizationId,
      tokenHash: hashToken(accessToken),
      scopes,
      expiresAt,
    });

    const response: Oauth2ClientCredentialsTokenResponse = {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: TOKEN_TTL_SECS,
      scope: scopes.join(" "),
    };
    return response;
  },
);
