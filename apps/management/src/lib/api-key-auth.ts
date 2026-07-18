import { createHash } from "node:crypto";
import { schema } from "@tunnet/db";
import * as argon2 from "argon2";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { parseApiKeyPrefix } from "./api-key-secret";
import { db } from "./db";

export type VerifiedApiKey = {
  id: string;
  organizationId: string;
  scopes: string[];
  /** Null = all networks in the organization. */
  networkIds: string[] | null;
};

export function hasScope(scopes: string[], required: string): boolean {
  return scopes.includes(required);
}

export function canAccessNetwork(
  apiKey: Pick<VerifiedApiKey, "networkIds">,
  networkId: string,
): boolean {
  if (apiKey.networkIds === null) {
    return true;
  }
  return apiKey.networkIds.includes(networkId);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function verifyOauthAccessToken(
  secret: string,
  organizationId?: string,
): Promise<VerifiedApiKey | null> {
  if (!secret.startsWith("tt_oauth_")) {
    return null;
  }
  const tokenHash = hashToken(secret);
  const now = new Date();
  const rows = await db
    .select({
      id: schema.oauthAccessTokens.id,
      organizationId: schema.oauthAccessTokens.organizationId,
      scopes: schema.oauthAccessTokens.scopes,
      networkIds: schema.oauthClients.networkIds,
    })
    .from(schema.oauthAccessTokens)
    .innerJoin(
      schema.oauthClients,
      eq(schema.oauthAccessTokens.clientId, schema.oauthClients.id),
    )
    .where(
      and(
        eq(schema.oauthAccessTokens.tokenHash, tokenHash),
        gt(schema.oauthAccessTokens.expiresAt, now),
        isNull(schema.oauthClients.revokedAt),
        organizationId
          ? eq(schema.oauthAccessTokens.organizationId, organizationId)
          : undefined,
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    organizationId: row.organizationId,
    scopes: row.scopes,
    networkIds: row.networkIds,
  };
}

export async function verifyApiKeySecret(
  secret: string,
  organizationId?: string,
): Promise<VerifiedApiKey | null> {
  const oauth = await verifyOauthAccessToken(secret, organizationId);
  if (oauth) {
    return oauth;
  }

  const prefix = parseApiKeyPrefix(secret);
  const now = new Date();

  const candidates = await db.query.apiKeys.findMany({
    where: and(
      isNull(schema.apiKeys.revokedAt),
      organizationId
        ? eq(schema.apiKeys.organizationId, organizationId)
        : undefined,
      prefix
        ? eq(schema.apiKeys.secretPrefix, prefix)
        : or(
            isNull(schema.apiKeys.secretPrefix),
            eq(schema.apiKeys.secretPrefix, ""),
          ),
    ),
  });

  for (const row of candidates) {
    if (row.expiresAt && row.expiresAt <= now) {
      continue;
    }
    const ok = await argon2.verify(row.hashedSecret, secret);
    if (!ok) {
      continue;
    }
    return {
      id: row.id,
      organizationId: row.organizationId,
      scopes: row.scopes,
      networkIds: row.networkIds,
    };
  }

  if (prefix && organizationId) {
    const legacy = await db.query.apiKeys.findMany({
      where: and(
        eq(schema.apiKeys.organizationId, organizationId),
        isNull(schema.apiKeys.revokedAt),
        isNull(schema.apiKeys.secretPrefix),
      ),
    });
    for (const row of legacy) {
      if (row.expiresAt && row.expiresAt <= now) {
        continue;
      }
      const ok = await argon2.verify(row.hashedSecret, secret);
      if (ok) {
        return {
          id: row.id,
          organizationId: row.organizationId,
          scopes: row.scopes,
          networkIds: row.networkIds,
        };
      }
    }
  }

  return null;
}
