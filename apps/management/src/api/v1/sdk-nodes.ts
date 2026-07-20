import type { RegisterDeviceResponse } from "@tunnet/api/internal";
import {
  registerSdkNodeBody,
  SDK_ENROLL_SCOPE,
  SDK_MANAGE_SCOPE,
} from "@tunnet/api/management";
import { schema } from "@tunnet/db";
import { formatIpv4Cidr } from "@tunnet/ip";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { canAccessNetwork, hasScope } from "../../lib/api-key-auth";
import { writeAudit } from "../../lib/audit";
import { registerDevice } from "../../lib/control-plane-client";
import { db } from "../../lib/db";
import { removeDeviceMembership } from "../../lib/remove-device-membership";
import {
  ensureTagDefinitionsExist,
  replaceDeviceTags,
} from "../../lib/tag-ownership";
import {
  apiKeyAuthPlugin,
  getApiKeyAuth,
  requireApiKey,
} from "./middleware/api-key-auth";
import { badRequest, forbidden, notFound } from "./middleware/session";

function requireEnrollOrManage() {
  return new Elysia({ name: "require-enroll-or-manage" }).onBeforeHandle(
    { as: "scoped" },
    ({ apiKeyAuth }) => {
      if (!apiKeyAuth) return forbidden();
      if (
        !hasScope(apiKeyAuth.scopes, SDK_ENROLL_SCOPE) &&
        !hasScope(apiKeyAuth.scopes, SDK_MANAGE_SCOPE)
      ) {
        return forbidden();
      }
    },
  );
}

function requireManage() {
  return new Elysia({ name: "require-sdk-manage" }).onBeforeHandle(
    { as: "scoped" },
    ({ apiKeyAuth }) => {
      if (!apiKeyAuth) return forbidden();
      if (!hasScope(apiKeyAuth.scopes, SDK_MANAGE_SCOPE)) {
        return forbidden();
      }
    },
  );
}

function resolveDeviceType(kind: string | undefined): "sdk" | "k8s" {
  if (kind && kind.startsWith("k8s-")) return "k8s";
  return "sdk";
}

export const sdkNodesRoutes = new Elysia()
  .use(apiKeyAuthPlugin)
  .use(requireApiKey)
  .use(requireEnrollOrManage())
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
      const kind = parsed.kind ?? "sdk";

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
        kind,
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

      let registerResult: RegisterDeviceResponse;
      try {
        registerResult = await registerDevice({
          endpointId: parsed.endpointId,
          organizationId: params.orgId,
          networkId: params.networkId,
          hostname: parsed.hostname,
          os: typeof metadata.os === "string" ? metadata.os : "linux",
          agentVersion:
            typeof metadata.agentVersion === "string"
              ? metadata.agentVersion
              : kind.startsWith("k8s")
                ? "k8s"
                : "sdk",
          deviceType: resolveDeviceType(kind),
          metadata,
          labels: parsed.labels,
          expiresIn: parsed.expiresIn,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Registration failed";
        return badRequest(message);
      }

      if (parsed.tags && parsed.tags.length > 0) {
        const missing = await ensureTagDefinitionsExist(
          params.orgId,
          parsed.tags,
        );
        if (missing.length > 0) {
          return badRequest(`Unknown tag definition(s): ${missing.join(", ")}`);
        }
        // API keys are treated as org admins for tag ownership.
        await replaceDeviceTags(parsed.endpointId, parsed.tags);
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
          kind,
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
  )
  .use(requireManage())
  .delete(
    "/organizations/:orgId/sdk-nodes",
    async ({ apiKeyAuth, params, body }) => {
      const auth = getApiKeyAuth({ apiKeyAuth });
      if (auth.organizationId !== params.orgId) {
        return forbidden();
      }

      const items = (
        body as {
          items?: Array<{ networkId: string; endpointId: string }>;
        }
      )?.items;
      if (!Array.isArray(items) || items.length === 0) {
        return badRequest("items required");
      }
      if (items.length > 100) {
        return badRequest("max 100 items");
      }

      let deleted = 0;
      await db.transaction(async (tx) => {
        for (const item of items) {
          if (!canAccessNetwork(auth, item.networkId)) {
            continue;
          }
          await removeDeviceMembership(tx, {
            organizationId: auth.organizationId,
            actor: `api_key:${auth.id}`,
            networkId: item.networkId,
            endpointId: item.endpointId,
          });
          deleted += 1;
        }
      });

      return { ok: true as const, deleted };
    },
  );
