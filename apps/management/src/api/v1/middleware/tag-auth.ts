import { parseRoleNames } from "@tunnet/api/auth";
import {
  TAG_ASSIGN_SCOPE,
  TAG_READ_SCOPE,
  TAG_WRITE_SCOPE,
} from "@tunnet/api/management";
import { Elysia } from "elysia";

import { auth } from "../../../auth";
import { hasScope, verifyApiKeySecret } from "../../../lib/api-key-auth";
import type { TagActor } from "../../../lib/tag-ownership";
import type { ApiKeyAuthContext } from "./api-key-auth";
import {
  type AuthContext,
  forbidden,
  resolveOrgContext,
  unauthorized,
} from "./session";

export type TagAuthMode = "read" | "write" | "assign";

const SESSION_PERMISSIONS = {
  read: ["read"],
  write: ["create", "update", "delete"],
  assign: ["assign"],
} as const satisfies Record<TagAuthMode, readonly string[]>;

const API_KEY_SCOPES: Record<TagAuthMode, string> = {
  read: TAG_READ_SCOPE,
  write: TAG_WRITE_SCOPE,
  assign: TAG_ASSIGN_SCOPE,
};

function orgIdFromParams(params: unknown): string {
  if (
    typeof params === "object" &&
    params !== null &&
    "orgId" in params &&
    typeof params.orgId === "string"
  ) {
    return params.orgId;
  }
  return "";
}

/**
 * Self-contained auth for tag routes. Nested Elysia plugins do not reliably
 * see parent `authContext` derives, so we resolve session/API key here.
 */
export function requireTagAccess(mode: TagAuthMode) {
  const apiKeyScope = API_KEY_SCOPES[mode];

  return new Elysia({ name: `require-tag-${mode}` })
    .derive({ as: "scoped" }, async ({ request, params }) => {
      const orgId = orgIdFromParams(params);
      const authHeader = request.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const secret = authHeader.slice(7).trim();
        const apiKeyAuth = secret
          ? await verifyApiKeySecret(secret, orgId || undefined)
          : null;
        return {
          authContext: null as AuthContext | null,
          apiKeyAuth,
        };
      }
      const authContext = await resolveOrgContext(request.headers, orgId);
      return {
        authContext,
        apiKeyAuth: null as ApiKeyAuthContext | null,
      };
    })
    .onBeforeHandle(
      { as: "scoped" },
      async ({ authContext, apiKeyAuth, request, params }) => {
        const orgId = orgIdFromParams(params);

        if (apiKeyAuth) {
          if (!orgId || apiKeyAuth.organizationId !== orgId) {
            return forbidden();
          }
          const scopes = apiKeyAuth.scopes;
          const ok =
            hasScope(scopes, apiKeyScope) ||
            (mode === "read" &&
              (hasScope(scopes, TAG_WRITE_SCOPE) ||
                hasScope(scopes, TAG_ASSIGN_SCOPE))) ||
            (mode === "assign" && hasScope(scopes, TAG_WRITE_SCOPE));
          if (!ok) {
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

        const permissions =
          mode === "assign"
            ? { tag: ["assign", "update", "create"] as string[] }
            : { tag: [...SESSION_PERMISSIONS[mode]] };

        const result = await auth.api.hasPermission({
          headers: request.headers,
          body: {
            organizationId: authContext.organizationId,
            permissions: permissions as Record<string, string[]>,
          },
        });

        if (!result?.success) {
          if (mode === "assign") {
            // Members may still assign when they own the tag; ownership is
            // checked in the handler.
            return;
          }
          return forbidden();
        }
      },
    );
}

export function isOrgAdminRole(memberRole: string): boolean {
  const names = parseRoleNames(memberRole);
  return names.includes("owner") || names.includes("admin");
}

export function getTagActor(ctx: {
  authContext: AuthContext | null;
  apiKeyAuth: ApiKeyAuthContext | null;
  endpointId?: string | null;
}): TagActor & {
  organizationId: string;
  userId: string | null;
  apiKeyId: string | null;
} {
  if (ctx.apiKeyAuth) {
    return {
      organizationId: ctx.apiKeyAuth.organizationId,
      userId: null,
      email: null,
      apiKeyId: ctx.apiKeyAuth.id,
      isOrgAdmin: true,
      endpointId: ctx.endpointId ?? null,
    };
  }
  if (ctx.authContext) {
    return {
      organizationId: ctx.authContext.organizationId,
      userId: ctx.authContext.user.id,
      email: ctx.authContext.user.email,
      apiKeyId: null,
      isOrgAdmin: isOrgAdminRole(ctx.authContext.memberRole),
      endpointId: ctx.endpointId ?? null,
    };
  }
  throw new Error("Tag auth context missing");
}
