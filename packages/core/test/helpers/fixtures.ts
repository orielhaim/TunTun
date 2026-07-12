import { randomBytes, randomUUID } from "node:crypto";

import { createDb, schema } from "@tuntun/db";
import * as argon2 from "argon2";
import { eq } from "drizzle-orm";

function generateApiKeySecret(): { secret: string; secretPrefix: string } {
  const segment = randomBytes(6).toString("base64url").slice(0, 8);
  const body = randomBytes(24).toString("base64url");
  return { secret: `tt_${segment}_${body}`, secretPrefix: segment };
}

async function insertApiKey(
  db: ReturnType<typeof createDb>,
  input: {
    organizationId: string;
    name: string;
    scopes: string[];
    networkIds: string[] | null;
  },
): Promise<{ secret: string; id: string }> {
  const { secret, secretPrefix } = generateApiKeySecret();
  const hashedSecret = await argon2.hash(secret);

  const [row] = await db
    .insert(schema.apiKeys)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      secretPrefix,
      hashedSecret,
      scopes: input.scopes,
      networkIds: input.networkIds,
    })
    .returning({ id: schema.apiKeys.id });

  return { secret, id: row.id };
}

export type NegativeTestKeys = {
  otherNetworkId: string;
  restrictedApiKeySecret: string;
  noScopeApiKeySecret: string;
  apiKeyIds: string[];
};

/** Ephemeral keys/network used only for authorization negative cases. */
export async function createNegativeTestKeys(input: {
  databaseUrl: string;
  orgId: string;
  primaryNetworkId: string;
}): Promise<NegativeTestKeys> {
  const db = createDb(input.databaseUrl);
  const otherNetworkId = randomUUID();

  await db.insert(schema.networks).values({
    id: otherNetworkId,
    organizationId: input.orgId,
    name: `sdk-test-secondary-${randomUUID().slice(0, 8)}`,
    cidr: "10.78.0.0/24",
  });

  const restricted = await insertApiKey(db, {
    organizationId: input.orgId,
    name: "sdk-test-primary-only",
    scopes: ["sdk:enroll"],
    networkIds: [input.primaryNetworkId],
  });

  const noScope = await insertApiKey(db, {
    organizationId: input.orgId,
    name: "sdk-test-no-scopes",
    scopes: [],
    networkIds: null,
  });

  return {
    otherNetworkId,
    restrictedApiKeySecret: restricted.secret,
    noScopeApiKeySecret: noScope.secret,
    apiKeyIds: [restricted.id, noScope.id],
  };
}

export async function deleteNegativeTestKeys(input: {
  databaseUrl: string;
  otherNetworkId: string;
  apiKeyIds: string[];
}): Promise<void> {
  const db = createDb(input.databaseUrl);
  await db
    .delete(schema.networks)
    .where(eq(schema.networks.id, input.otherNetworkId));
  for (const id of input.apiKeyIds) {
    await db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, id));
  }
}
