import { Elysia } from "elysia";

import { isAdmin } from "../../../lib/authz";
import type { AuthContext } from "./session";
import { forbidden, unauthorized } from "./session";

export const requireAuth = new Elysia({ name: "require-auth" }).onBeforeHandle(
  { as: "scoped" },
  ({ authContext }) => {
    if (!authContext) {
      return unauthorized();
    }
  },
);

export const requireAdmin = new Elysia({
  name: "require-admin",
}).onBeforeHandle({ as: "scoped" }, ({ authContext }) => {
  if (!authContext) {
    return unauthorized();
  }
  if (!isAdmin(authContext.memberRole)) {
    return forbidden();
  }
});

export function getAuth(ctx: { authContext: AuthContext | null }): AuthContext {
  if (!ctx.authContext) {
    throw new Error("Auth context missing");
  }
  return ctx.authContext;
}
