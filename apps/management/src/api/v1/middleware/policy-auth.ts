import {
  POLICY_APPLY_SCOPE,
  POLICY_READ_SCOPE,
  POLICY_WRITE_SCOPE,
} from "@tunnet/api/management";
import { Elysia } from "elysia";

import { auth } from "../../../auth";
import { hasScope } from "../../../lib/api-key-auth";
import { type ApiKeyAuthContext, apiKeyAuthPlugin } from "./api-key-auth";
import {
  type AuthContext,
  forbidden,
  sessionPlugin,
  unauthorized,
} from "./session";

export type PolicyAuthMode = "read" | "write" | "apply";

const SESSION_PERMISSIONS = {
  read: ["read"],
  write: ["create", "update", "delete"],
  apply: ["update"],
} as const satisfies Record<PolicyAuthMode, readonly string[]>;

const API_KEY_SCOPES: Record<PolicyAuthMode, string> = {
  read: POLICY_READ_SCOPE,
  write: POLICY_WRITE_SCOPE,
  apply: POLICY_APPLY_SCOPE,
};

export const policyAuthPlugin = new Elysia({ name: "policy-auth" })
  .use(sessionPlugin)
  .use(apiKeyAuthPlugin);

export function requirePolicyAccess(mode: PolicyAuthMode) {
  const apiKeyScope = API_KEY_SCOPES[mode];

  return new Elysia({ name: `require-policy-${mode}` }).onBeforeHandle(
    { as: "scoped" },
    async ({ authContext, apiKeyAuth, request, params }) => {
      const orgId =
        typeof params === "object" &&
        params !== null &&
        "orgId" in params &&
        typeof params.orgId === "string"
          ? params.orgId
          : "";

      if (apiKeyAuth) {
        if (!orgId || apiKeyAuth.organizationId !== orgId) {
          return forbidden();
        }
        if (!hasScope(apiKeyAuth.scopes, apiKeyScope)) {
          return forbidden();
        }
        return;
      }

      if (!authContext) {
        return unauthorized();
      }
      if (!orgId || authContext.organizationId !== orgId) {
        return forbidden();
      }

      const result = await auth.api.hasPermission({
        headers: request.headers,
        body: {
          organizationId: authContext.organizationId,
          permissions: {
            policy: [...SESSION_PERMISSIONS[mode]],
          },
        },
      });

      if (!result?.success) {
        return forbidden();
      }
    },
  );
}

export function getPolicyActor(ctx: {
  authContext: AuthContext | null;
  apiKeyAuth: ApiKeyAuthContext | null;
}): {
  organizationId: string;
  userId: string | null;
  apiKeyId: string | null;
} {
  if (ctx.apiKeyAuth) {
    return {
      organizationId: ctx.apiKeyAuth.organizationId,
      userId: null,
      apiKeyId: ctx.apiKeyAuth.id,
    };
  }
  if (ctx.authContext) {
    return {
      organizationId: ctx.authContext.organizationId,
      userId: ctx.authContext.user.id,
      apiKeyId: null,
    };
  }
  throw new Error("Policy auth context missing");
}
