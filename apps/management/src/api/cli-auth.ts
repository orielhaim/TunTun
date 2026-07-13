import { Elysia } from "elysia";

import { OAUTH_CLIENT_CLI } from "../auth";

const apiOrigin = () =>
  (
    process.env.TUNTUN_MANAGEMENT_PUBLIC_URL ??
    process.env.MANAGEMENT_API_PUBLIC_URL ??
    `http://localhost:${process.env.MANAGEMENT_PORT ?? 3000}`
  ).replace(/\/$/, "");

const dashboardOrigin = () =>
  (process.env.MANAGEMENT_WEB_ORIGIN ?? "http://localhost:5173").replace(
    /\/$/,
    "",
  );

/** Public CLI auth discovery (device authorization / RFC 8628). */
export const cliAuthRoutes = new Elysia().get("/auth/cli/config", () => {
  const base = apiOrigin();
  const web = dashboardOrigin();
  return {
    clientId: process.env.TUNTUN_OAUTH_CLI_CLIENT_ID || OAUTH_CLIENT_CLI,
    issuer: `${base}/api/auth`,
    deviceCodeEndpoint: `${base}/api/auth/device/code`,
    deviceTokenEndpoint: `${base}/api/auth/device/token`,
    verificationUri: `${web}/app/settings/account`,
    scopes: ["openid", "profile", "email", "offline_access", "mesh:connect"],
  };
});
