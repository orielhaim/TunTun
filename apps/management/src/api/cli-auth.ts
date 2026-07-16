import { getDashboardUrl, getManagementUrl } from "@tunnet/env";
import { Elysia } from "elysia";

import { OAUTH_CLIENT_CLI } from "../auth";

export const cliAuthRoutes = new Elysia().get("/auth/cli/config", () => {
  const base = getManagementUrl();
  const web = getDashboardUrl();
  return {
    clientId: process.env.TUNNET_OAUTH_CLI_CLIENT_ID || OAUTH_CLIENT_CLI,
    issuer: `${base}/api/auth`,
    deviceCodeEndpoint: `${base}/api/auth/device/code`,
    deviceTokenEndpoint: `${base}/api/auth/device/token`,
    verificationUri: `${web}/app/settings/account`,
    scopes: ["openid", "profile", "email", "offline_access", "mesh:connect"],
  };
});
