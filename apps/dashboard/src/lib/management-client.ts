import {
  apiKeyListResponse,
  auditListResponse,
  type CreateApiKeyBody,
  type CreateEnrollmentTokenBody,
  type CreateHostnameRouteBody,
  type CreateNetworkBody,
  type CreatePolicyBody,
  type CreateRelayBody,
  type CreateServeBody,
  type CreateSubnetRouteBody,
  type CreateTunnelBody,
  type CreateTunnelPortMappingBody,
  type CreateTunnelRedirectRuleBody,
  createApiKeyBody,
  createApiKeyResponse,
  createEnrollmentTokenBody,
  createEnrollmentTokenResponse,
  createHostnameRouteBody,
  createNetworkBody,
  createPolicyBody,
  createRelayBody,
  createRelayResponse,
  createServeBody,
  createServeResponse,
  createSubnetRouteBody,
  createTunnelBody,
  createTunnelPortMappingBody,
  createTunnelRedirectRuleBody,
  createTunnelResponse,
  type DeleteDeviceItem,
  deleteDevicesBody,
  deleteDevicesResponse,
  deviceAddressesResponse,
  deviceDetailSchema,
  deviceListResponse,
  enrollmentTokenListResponse,
  hostnameRouteListResponse,
  hostnameRouteSchema,
  internalCaSchema,
  networkListResponse,
  networkMetricsResponse,
  networkSchema,
  organizationTunnelSettingsSchema,
  type PatchDeviceBody,
  type PatchDeviceMembershipBody,
  type PatchHostnameRouteBody,
  type PatchNetworkBody,
  type PatchOrganizationTunnelSettingsBody,
  type PatchPolicyBody,
  type PatchRelayBody,
  type PatchServeBody,
  type PatchSubnetRouteBody,
  type PatchTunnelBody,
  type PatchTunnelPortMappingBody,
  type PatchTunnelRedirectRuleBody,
  patchDeviceBody,
  patchDeviceMembershipBody,
  patchHostnameRouteBody,
  patchNetworkBody,
  patchOrganizationTunnelSettingsBody,
  patchPolicyBody,
  patchRelayBody,
  patchServeBody,
  patchSubnetRouteBody,
  patchTunnelBody,
  patchTunnelPortMappingBody,
  patchTunnelRedirectRuleBody,
  policyListResponse,
  policySchema,
  relayHealthResponse,
  relayListResponse,
  relaySchema,
  rotateInternalCaResponse,
  serveListResponse,
  servePeersResponse,
  serveSchema,
  subnetRouteListResponse,
  subnetRouteSchema,
  topologyResponse,
  tunnelListResponse,
  tunnelPortMappingListResponse,
  tunnelPortMappingSchema,
  tunnelRedirectRuleListResponse,
  tunnelRedirectRuleSchema,
  tunnelSchema,
  tunnelTrafficListResponse,
} from "@tuntun/api/management";
import type { z } from "zod";
import { z as zod } from "zod";

import { getManagementApiUrl } from "@/lib/env";

const relayDetailResponse = zod.object({ relay: relaySchema });
const tunnelDetailResponse = zod.object({ tunnel: tunnelSchema });
const serveDetailResponse = zod.object({ serve: serveSchema });
const tunnelSettingsResponse = zod.object({
  settings: organizationTunnelSettingsSchema,
});
const redirectRuleDetailResponse = zod.object({
  redirectRule: tunnelRedirectRuleSchema,
});
const portMappingDetailResponse = zod.object({
  portMapping: tunnelPortMappingSchema,
});

class ManagementApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ManagementApiError";
  }
}

async function request<T>(
  orgId: string,
  path: string,
  init: RequestInit = {},
  schema?: z.ZodType<T>,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("X-Organization-Id", orgId);

  const response = await fetch(`${getManagementApiUrl()}/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new ManagementApiError(
      body?.error ?? response.statusText,
      response.status,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const data: unknown = await response.json();
  if (!schema) return data as T;

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ManagementApiError(
      `Invalid API response: ${parsed.error.message}`,
      500,
    );
  }
  return parsed.data;
}

export function createManagementClient(orgId: string) {
  const org = (path: string) => `/organizations/${orgId}${path}`;

  return {
    listNetworks: () =>
      request(orgId, org("/networks"), {}, networkListResponse),

    getNetwork: (networkId: string) =>
      request(orgId, org(`/networks/${networkId}`), {}, networkSchema),

    createNetwork: (body: CreateNetworkBody) =>
      request(
        orgId,
        org("/networks"),
        { method: "POST", body: JSON.stringify(createNetworkBody.parse(body)) },
        networkSchema,
      ),

    updateNetwork: (networkId: string, body: PatchNetworkBody) =>
      request(
        orgId,
        org(`/networks/${networkId}`),
        {
          method: "PATCH",
          body: JSON.stringify(patchNetworkBody.parse(body)),
        },
        networkSchema,
      ),

    deleteNetwork: (networkId: string) =>
      request<{ ok: boolean }>(orgId, org(`/networks/${networkId}`), {
        method: "DELETE",
      }),

    listDevices: (networkId: string) =>
      request(
        orgId,
        org(`/networks/${networkId}/devices`),
        {},
        deviceListResponse,
      ),

    updateDeviceMembership: (
      networkId: string,
      endpointId: string,
      body: PatchDeviceMembershipBody,
    ) =>
      request(
        orgId,
        org(`/networks/${networkId}/devices/${endpointId}`),
        {
          method: "PATCH",
          body: JSON.stringify(patchDeviceMembershipBody.parse(body)),
        },
        deviceListResponse.shape.devices.element,
      ),

    getDevice: (endpointId: string) =>
      request(orgId, org(`/devices/${endpointId}`), {}, deviceDetailSchema),

    updateDevice: (endpointId: string, body: PatchDeviceBody) =>
      request(
        orgId,
        org(`/devices/${endpointId}`),
        {
          method: "PATCH",
          body: JSON.stringify(patchDeviceBody.parse(body)),
        },
        deviceDetailSchema,
      ),

    deleteDevice: (networkId: string, endpointId: string) =>
      request<{ ok: boolean }>(
        orgId,
        org(`/networks/${networkId}/devices/${endpointId}`),
        { method: "DELETE" },
      ),

    deleteDevices: (items: DeleteDeviceItem[]) =>
      request(
        orgId,
        org("/devices"),
        {
          method: "DELETE",
          body: JSON.stringify(deleteDevicesBody.parse({ items })),
        },
        deleteDevicesResponse,
      ),

    listPolicies: (networkId: string) =>
      request(
        orgId,
        org(`/networks/${networkId}/policies`),
        {},
        policyListResponse,
      ),

    createPolicy: (networkId: string, body: CreatePolicyBody) =>
      request(
        orgId,
        org(`/networks/${networkId}/policies`),
        {
          method: "POST",
          body: JSON.stringify(createPolicyBody.parse(body)),
        },
        policySchema,
      ),

    updatePolicy: (
      networkId: string,
      policyId: string,
      body: PatchPolicyBody,
    ) =>
      request(
        orgId,
        org(`/networks/${networkId}/policies/${policyId}`),
        {
          method: "PATCH",
          body: JSON.stringify(patchPolicyBody.parse(body)),
        },
        policySchema,
      ),

    deletePolicy: (networkId: string, policyId: string) =>
      request<{ ok: boolean }>(
        orgId,
        org(`/networks/${networkId}/policies/${policyId}`),
        { method: "DELETE" },
      ),

    listSubnetRoutes: (networkId: string) =>
      request(
        orgId,
        org(`/networks/${networkId}/routes`),
        {},
        subnetRouteListResponse,
      ),

    createSubnetRoute: (networkId: string, body: CreateSubnetRouteBody) =>
      request(
        orgId,
        org(`/networks/${networkId}/routes`),
        {
          method: "POST",
          body: JSON.stringify(createSubnetRouteBody.parse(body)),
        },
        subnetRouteSchema,
      ),

    updateSubnetRoute: (
      networkId: string,
      routeId: string,
      body: PatchSubnetRouteBody,
    ) =>
      request(
        orgId,
        org(`/networks/${networkId}/routes/${routeId}`),
        {
          method: "PATCH",
          body: JSON.stringify(patchSubnetRouteBody.parse(body)),
        },
        subnetRouteSchema,
      ),

    deleteSubnetRoute: (networkId: string, routeId: string) =>
      request<{ ok: boolean }>(
        orgId,
        org(`/networks/${networkId}/routes/${routeId}`),
        { method: "DELETE" },
      ),

    listHostnameRoutes: (networkId: string) =>
      request(
        orgId,
        org(`/networks/${networkId}/hostname-routes`),
        {},
        hostnameRouteListResponse,
      ),

    createHostnameRoute: (networkId: string, body: CreateHostnameRouteBody) =>
      request(
        orgId,
        org(`/networks/${networkId}/hostname-routes`),
        {
          method: "POST",
          body: JSON.stringify(createHostnameRouteBody.parse(body)),
        },
        hostnameRouteSchema,
      ),

    updateHostnameRoute: (
      networkId: string,
      routeId: string,
      body: PatchHostnameRouteBody,
    ) =>
      request(
        orgId,
        org(`/networks/${networkId}/hostname-routes/${routeId}`),
        {
          method: "PATCH",
          body: JSON.stringify(patchHostnameRouteBody.parse(body)),
        },
        hostnameRouteSchema,
      ),

    deleteHostnameRoute: (networkId: string, routeId: string) =>
      request<{ ok: boolean }>(
        orgId,
        org(`/networks/${networkId}/hostname-routes/${routeId}`),
        { method: "DELETE" },
      ),

    listEnrollmentTokens: (networkId: string) =>
      request(
        orgId,
        org(`/networks/${networkId}/enrollment-tokens`),
        {},
        enrollmentTokenListResponse,
      ),

    createEnrollmentToken: (
      networkId: string,
      body: CreateEnrollmentTokenBody = { ttlMinutes: 15 },
    ) =>
      request(
        orgId,
        org(`/networks/${networkId}/enrollment-tokens`),
        {
          method: "POST",
          body: JSON.stringify(createEnrollmentTokenBody.parse(body)),
        },
        createEnrollmentTokenResponse,
      ),

    revokeEnrollmentToken: (networkId: string, tokenHash: string) =>
      request<{ ok: boolean }>(
        orgId,
        org(`/networks/${networkId}/enrollment-tokens/${tokenHash}`),
        { method: "DELETE" },
      ),

    listApiKeys: () => request(orgId, org("/api-keys"), {}, apiKeyListResponse),

    createApiKey: (body: CreateApiKeyBody) =>
      request(
        orgId,
        org("/api-keys"),
        {
          method: "POST",
          body: JSON.stringify(createApiKeyBody.parse(body)),
        },
        createApiKeyResponse,
      ),

    revokeApiKey: (keyId: string) =>
      request<{ ok: boolean }>(orgId, org(`/api-keys/${keyId}`), {
        method: "DELETE",
      }),

    listAuditLog: (cursor?: number, limit = 50) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor !== undefined) params.set("cursor", String(cursor));
      return request(
        orgId,
        org(`/audit-log?${params.toString()}`),
        {},
        auditListResponse,
      );
    },

    getDeviceAddresses: (endpointId: string) =>
      request(
        orgId,
        org(`/devices/${endpointId}/addresses`),
        {},
        deviceAddressesResponse,
      ),

    getTopology: (networkId: string) =>
      request(
        orgId,
        org(`/networks/${networkId}/topology`),
        {},
        topologyResponse,
      ),

    getNetworkMetrics: (networkId: string) =>
      request(
        orgId,
        org(`/networks/${networkId}/metrics`),
        {},
        networkMetricsResponse,
      ),

    listRelays: () => request(orgId, org("/relays"), {}, relayListResponse),

    getRelay: (relayId: string) =>
      request(orgId, org(`/relays/${relayId}`), {}, relayDetailResponse),

    createRelay: (body: CreateRelayBody) =>
      request(
        orgId,
        org("/relays"),
        { method: "POST", body: JSON.stringify(createRelayBody.parse(body)) },
        createRelayResponse,
      ),

    updateRelay: (relayId: string, body: PatchRelayBody) =>
      request(
        orgId,
        org(`/relays/${relayId}`),
        {
          method: "PATCH",
          body: JSON.stringify(patchRelayBody.parse(body)),
        },
        relayDetailResponse,
      ),

    deleteRelay: (relayId: string) =>
      request<{ ok: boolean }>(orgId, org(`/relays/${relayId}`), {
        method: "DELETE",
      }),

    listTunnels: (networkId: string) =>
      request(
        orgId,
        org(`/networks/${networkId}/tunnels`),
        {},
        tunnelListResponse,
      ),

    getTunnel: (networkId: string, tunnelId: string) =>
      request(
        orgId,
        org(`/networks/${networkId}/tunnels/${tunnelId}`),
        {},
        tunnelDetailResponse,
      ),

    createTunnel: (networkId: string, body: CreateTunnelBody) =>
      request(
        orgId,
        org(`/networks/${networkId}/tunnels`),
        {
          method: "POST",
          body: JSON.stringify(createTunnelBody.parse(body)),
        },
        createTunnelResponse,
      ),

    updateTunnel: (
      networkId: string,
      tunnelId: string,
      body: PatchTunnelBody,
    ) =>
      request(
        orgId,
        org(`/networks/${networkId}/tunnels/${tunnelId}`),
        {
          method: "PATCH",
          body: JSON.stringify(patchTunnelBody.parse(body)),
        },
        tunnelDetailResponse,
      ),

    deleteTunnel: (networkId: string, tunnelId: string) =>
      request<{ ok: boolean }>(
        orgId,
        org(`/networks/${networkId}/tunnels/${tunnelId}`),
        { method: "DELETE" },
      ),

    listTunnelRedirectRules: (networkId: string, tunnelId: string) =>
      request(
        orgId,
        org(`/networks/${networkId}/tunnels/${tunnelId}/redirect-rules`),
        {},
        tunnelRedirectRuleListResponse,
      ),

    createTunnelRedirectRule: (
      networkId: string,
      tunnelId: string,
      body: CreateTunnelRedirectRuleBody,
    ) =>
      request(
        orgId,
        org(`/networks/${networkId}/tunnels/${tunnelId}/redirect-rules`),
        {
          method: "POST",
          body: JSON.stringify(createTunnelRedirectRuleBody.parse(body)),
        },
        redirectRuleDetailResponse,
      ),

    updateTunnelRedirectRule: (
      networkId: string,
      tunnelId: string,
      ruleId: string,
      body: PatchTunnelRedirectRuleBody,
    ) =>
      request(
        orgId,
        org(
          `/networks/${networkId}/tunnels/${tunnelId}/redirect-rules/${ruleId}`,
        ),
        {
          method: "PATCH",
          body: JSON.stringify(patchTunnelRedirectRuleBody.parse(body)),
        },
        redirectRuleDetailResponse,
      ),

    deleteTunnelRedirectRule: (
      networkId: string,
      tunnelId: string,
      ruleId: string,
    ) =>
      request<{ ok: boolean }>(
        orgId,
        org(
          `/networks/${networkId}/tunnels/${tunnelId}/redirect-rules/${ruleId}`,
        ),
        { method: "DELETE" },
      ),

    listTunnelPortMappings: (networkId: string, tunnelId: string) =>
      request(
        orgId,
        org(`/networks/${networkId}/tunnels/${tunnelId}/port-mappings`),
        {},
        tunnelPortMappingListResponse,
      ),

    createTunnelPortMapping: (
      networkId: string,
      tunnelId: string,
      body: CreateTunnelPortMappingBody,
    ) =>
      request(
        orgId,
        org(`/networks/${networkId}/tunnels/${tunnelId}/port-mappings`),
        {
          method: "POST",
          body: JSON.stringify(createTunnelPortMappingBody.parse(body)),
        },
        portMappingDetailResponse,
      ),

    updateTunnelPortMapping: (
      networkId: string,
      tunnelId: string,
      mappingId: string,
      body: PatchTunnelPortMappingBody,
    ) =>
      request(
        orgId,
        org(
          `/networks/${networkId}/tunnels/${tunnelId}/port-mappings/${mappingId}`,
        ),
        {
          method: "PATCH",
          body: JSON.stringify(patchTunnelPortMappingBody.parse(body)),
        },
        portMappingDetailResponse,
      ),

    deleteTunnelPortMapping: (
      networkId: string,
      tunnelId: string,
      mappingId: string,
    ) =>
      request<{ ok: boolean }>(
        orgId,
        org(
          `/networks/${networkId}/tunnels/${tunnelId}/port-mappings/${mappingId}`,
        ),
        { method: "DELETE" },
      ),

    listTunnelTraffic: (networkId: string, tunnelId: string, limit = 100) =>
      request(
        orgId,
        org(
          `/networks/${networkId}/tunnels/${tunnelId}/traffic?limit=${limit}`,
        ),
        {},
        tunnelTrafficListResponse,
      ),

    listServes: (networkId: string) =>
      request(
        orgId,
        org(`/networks/${networkId}/serves`),
        {},
        serveListResponse,
      ),

    getServe: (networkId: string, serveId: string) =>
      request(
        orgId,
        org(`/networks/${networkId}/serves/${serveId}`),
        {},
        serveDetailResponse,
      ),

    listServePeers: (networkId: string, serveId: string) =>
      request(
        orgId,
        org(`/networks/${networkId}/serves/${serveId}/peers`),
        {},
        servePeersResponse,
      ),

    createServe: (networkId: string, body: CreateServeBody) =>
      request(
        orgId,
        org(`/networks/${networkId}/serves`),
        {
          method: "POST",
          body: JSON.stringify(createServeBody.parse(body)),
        },
        createServeResponse,
      ),

    updateServe: (networkId: string, serveId: string, body: PatchServeBody) =>
      request(
        orgId,
        org(`/networks/${networkId}/serves/${serveId}`),
        {
          method: "PATCH",
          body: JSON.stringify(patchServeBody.parse(body)),
        },
        serveDetailResponse,
      ),

    deleteServe: (networkId: string, serveId: string) =>
      request<{ ok: boolean }>(
        orgId,
        org(`/networks/${networkId}/serves/${serveId}`),
        { method: "DELETE" },
      ),

    getRelayHealth: (relayId: string, limit = 100) =>
      request(
        orgId,
        org(`/relays/${relayId}/health?limit=${limit}`),
        {},
        relayHealthResponse,
      ),

    getInternalCa: () =>
      request(orgId, org("/internal-ca"), {}, internalCaSchema),

    rotateInternalCa: () =>
      request(
        orgId,
        org("/internal-ca/rotate"),
        { method: "POST" },
        rotateInternalCaResponse,
      ),

    getTunnelSettings: () =>
      request(orgId, org("/tunnel-settings"), {}, tunnelSettingsResponse),

    updateTunnelSettings: (body: PatchOrganizationTunnelSettingsBody) =>
      request(
        orgId,
        org("/tunnel-settings"),
        {
          method: "PATCH",
          body: JSON.stringify(patchOrganizationTunnelSettingsBody.parse(body)),
        },
        tunnelSettingsResponse,
      ),
  };
}

export type ManagementClient = ReturnType<typeof createManagementClient>;
