import { registerSdkNodeBody, SDK_ENROLL_SCOPE } from "@tuntun/api/management";
import { formatIpv4Cidr } from "@tuntun/db";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";

import { schema } from "@tuntun/db";

import { canAccessNetwork } from "../../lib/api-key-auth";

import {
  apiKeyAuthPlugin,
  getApiKeyAuth,
  requireApiKey,
  requireApiKeyScope,
} from "./middleware/api-key-auth";
import { badRequest, forbidden, notFound } from "./middleware/session";
import { registerDevice } from "../../lib/control-plane-client";
import { db } from "../../lib/db";
import { writeAudit } from "../../lib/audit";

export const sdkNodesRoutes = new Elysia()
  .use(apiKeyAuthPlugin)
  .use(requireApiKey)
  .use(requireApiKeyScope(SDK_ENROLL_SCOPE))
  .post(
    "/organizations/:orgId/networks/:networkId/sdk-nodes",
    async ({ apiKeyAuth, params, body, request }) => {
      const auth = getApiKeyAuth({ apiKeyAuth });
      if (auth.organizationId !== params.orgId) {
        return forbidden();
      }

      if (!canAccessNetwork(auth, params.networkId)) {
        return forbidden();
      }

      const parsed = registerSdkNodeBody.parse(body);

      const network = await db.query.networks.findFirst({
        where: and(
          eq(schema.networks.id, params.networkId),
          eq(schema.networks.organizationId, params.orgId),
        ),
      });
      if (!network) {
        return notFound("Network not found");
      }

      const metadata: Record<string, unknown> = {
        ...(parsed.metadata ?? {}),
        kind: "sdk",
        hostname: parsed.hostname,
      };
      if (parsed.processName) {
        metadata.processName = parsed.processName;
      }
      if (parsed.runtime) {
        metadata.runtime = parsed.runtime;
      }

      const userAgent = request.headers.get("user-agent");
      if (userAgent) {
        metadata.userAgent = userAgent;
      }

      let registerResult;
      try {
        registerResult = await registerDevice({
          endpointId: parsed.endpointId,
          organizationId: params.orgId,
          networkId: params.networkId,
          hostname: parsed.hostname,
          os: typeof metadata.os === "string" ? metadata.os : "unknown",
          agentVersion:
            typeof metadata.agentVersion === "string"
              ? metadata.agentVersion
              : "sdk",
          deviceType: "sdk",
          metadata,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Registration failed";
        return badRequest(message);
      }

      const membership = (
        registerResult.snapshot as {
          memberships?: Array<{
            network_id?: string;
            networkId?: string;
            assigned_ipv4?: string;
            assignedIpv4?: string;
            prefix?: number;
          }>;
        }
      ).memberships?.find(
        (m) => (m.network_id ?? m.networkId) === params.networkId,
      );

      const assignedIp =
        membership?.assigned_ipv4 ?? membership?.assignedIpv4 ?? null;
      if (!assignedIp) {
        return badRequest("Registered device missing network membership");
      }

      await writeAudit(db, {
        organizationId: params.orgId,
        actor: `api_key:${auth.id}`,
        action: "sdk_node.registered",
        target: parsed.endpointId,
        metadata: {
          networkId: params.networkId,
          hostname: parsed.hostname,
        },
      });

      return {
        organizationId: registerResult.organizationId,
        networkId: registerResult.networkId,
        networkName: registerResult.networkName,
        assignedIp,
        networkCidr: formatIpv4Cidr(network.cidr),
        snapshot: registerResult.snapshot,
      };
    },
  );
