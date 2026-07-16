import { Elysia } from "elysia";

import { auth } from "../../../auth";
import type { AuthContext } from "./session";
import { forbidden, unauthorized } from "./session";

export type PermissionCheck = Record<string, string[]>;

export const requireAuth = new Elysia({ name: "require-auth" }).onBeforeHandle(
  { as: "scoped" },
  ({ authContext }) => {
    if (!authContext) {
      return unauthorized();
    }
  },
);

export function requirePermission(permissions: PermissionCheck) {
  const name = `require-permission-${Object.entries(permissions)
    .map(([k, v]) => `${k}:${v.join("+")}`)
    .join("|")}`;

  return new Elysia({ name }).onBeforeHandle(
    { as: "scoped" },
    async ({ authContext, request }) => {
      if (!authContext) {
        return unauthorized();
      }

      const result = await auth.api.hasPermission({
        headers: request.headers,
        body: {
          organizationId: authContext.organizationId,
          permissions,
        },
      });

      if (!result?.success) {
        return forbidden();
      }
    },
  );
}

export function getAuth(ctx: { authContext: AuthContext | null }): AuthContext {
  if (!ctx.authContext) {
    throw new Error("Auth context missing");
  }
  return ctx.authContext;
}
