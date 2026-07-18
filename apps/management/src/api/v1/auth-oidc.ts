import { oidcExchangeRequest } from "@tunnet/api/management";
import { Elysia } from "elysia";

function notImplemented(feature: string) {
  return new Response(
    JSON.stringify({
      error: `${feature} is not implemented yet. This endpoint is reserved for Phase 4 OIDC federation.`,
    }),
    {
      status: 501,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export const authOidcRoutes = new Elysia().post(
  "/auth/oidc/exchange",
  ({ body }) => {
    oidcExchangeRequest.parse(body);
    return notImplemented(
      "OIDC workload identity exchange (POST /api/v1/auth/oidc/exchange)",
    );
  },
);
