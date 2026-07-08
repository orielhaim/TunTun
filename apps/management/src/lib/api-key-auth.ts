import { and, eq, isNull, or } from "drizzle-orm";
import * as argon2 from "argon2";

import { schema } from "@tuntun/db";

import { db } from "./db";
import { parseApiKeyPrefix } from "./api-key-secret";

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

export async function verifyApiKeySecret(
  secret: string,
  organizationId?: string,
): Promise<VerifiedApiKey | null> {
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

  // Legacy keys without a stored prefix: scan org keys when prefix lookup misses.
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
