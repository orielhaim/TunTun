import { Elysia } from "elysia";

import {
  hasScope,
  type VerifiedApiKey,
  verifyApiKeySecret,
} from "../../../lib/api-key-auth";
import { forbidden, unauthorized } from "./session";

export type ApiKeyAuthContext = VerifiedApiKey;

export const apiKeyAuthPlugin = new Elysia({ name: "api-key-auth" }).derive(
  { as: "scoped" },
  async ({ request, params }) => {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return { apiKeyAuth: null as ApiKeyAuthContext | null };
    }

    const secret = authHeader.slice(7).trim();
    if (!secret) {
      return { apiKeyAuth: null as ApiKeyAuthContext | null };
    }

    const orgId =
      typeof params === "object" &&
      params !== null &&
      "orgId" in params &&
      typeof params.orgId === "string"
        ? params.orgId
        : undefined;

    const apiKeyAuth = await verifyApiKeySecret(secret, orgId);
    return { apiKeyAuth };
  },
);

export const requireApiKey = new Elysia({
  name: "require-api-key",
}).onBeforeHandle({ as: "scoped" }, ({ apiKeyAuth }) => {
  if (!apiKeyAuth) {
    return unauthorized();
  }
});

export function requireApiKeyScope(scope: string) {
  return new Elysia({ name: `require-scope-${scope}` }).onBeforeHandle(
    { as: "scoped" },
    ({ apiKeyAuth }) => {
      if (!apiKeyAuth) {
        return unauthorized();
      }
      if (!hasScope(apiKeyAuth.scopes, scope)) {
        return forbidden();
      }
    },
  );
}

export function getApiKeyAuth(ctx: {
  apiKeyAuth: ApiKeyAuthContext | null;
}): ApiKeyAuthContext {
  if (!ctx.apiKeyAuth) {
    throw new Error("API key auth context missing");
  }
  return ctx.apiKeyAuth;
}
