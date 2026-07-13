import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";

import { cliAuthRoutes } from "./api/cli-auth";
import { sshAuthBrowserRoutes } from "./api/ssh-auth-browser";
import { apiV1 } from "./api/v1";
import { auth, ensureTrustedOAuthClients } from "./auth";
import { repairStrippedMeshCidrs } from "./lib/repair-mesh-cidrs";

const port = Number(process.env.MANAGEMENT_PORT ?? 3000);
const webOrigin = process.env.MANAGEMENT_WEB_ORIGIN ?? "http://localhost:5173";

await repairStrippedMeshCidrs().catch((err) => {
  console.error("mesh CIDR repair failed:", err);
});

await ensureTrustedOAuthClients().catch((err) => {
  console.warn("oauth client bootstrap failed:", err);
});

const oauthAuthServerMetadata = oauthProviderAuthServerMetadata(auth);
const openIdConfigMetadata = oauthProviderOpenIdConfigMetadata(auth);

const app = new Elysia()
  .use(
    cors({
      origin: webOrigin,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Organization-Id",
        "Cache-Control",
      ],
    }),
  )
  .get("/.well-known/oauth-authorization-server", ({ request }) =>
    oauthAuthServerMetadata(request),
  )
  .get("/.well-known/oauth-authorization-server/api/auth", ({ request }) =>
    oauthAuthServerMetadata(request),
  )
  .get("/.well-known/openid-configuration", ({ request }) =>
    openIdConfigMetadata(request),
  )
  .get("/api/auth/.well-known/openid-configuration", ({ request }) =>
    openIdConfigMetadata(request),
  )
  .mount(auth.handler)
  .use(cliAuthRoutes)
  .use(sshAuthBrowserRoutes)
  .use(apiV1)
  .get("/health", () => ({ status: "ok" }))
  .listen(port);

console.log(
  `TunTun management server running at ${app.server?.hostname}:${app.server?.port}`,
);
