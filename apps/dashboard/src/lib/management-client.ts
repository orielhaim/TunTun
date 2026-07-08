import {
  apiKeyListResponse,
  auditListResponse,
  createApiKeyBody,
  createApiKeyResponse,
  createEnrollmentTokenBody,
  createEnrollmentTokenResponse,
  createNetworkBody,
  createPolicyBody,
  deviceAddressesResponse,
  deviceDetailSchema,
  deviceListResponse,
  deleteDevicesBody,
  deleteDevicesResponse,
  enrollmentTokenListResponse,
  networkListResponse,
  networkSchema,
  patchDeviceBody,
  patchDeviceMembershipBody,
  patchNetworkBody,
  patchPolicyBody,
  policyListResponse,
  policySchema,
  type CreateApiKeyBody,
  type CreateEnrollmentTokenBody,
  type CreateNetworkBody,
  type CreatePolicyBody,
  type DeleteDeviceItem,
  type PatchDeviceBody,
  type PatchDeviceMembershipBody,
  type PatchNetworkBody,
  type PatchPolicyBody,
} from "@tuntun/api/management";
import type { z } from "zod";

import { getManagementApiUrl } from "@/lib/env";

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

    listEnrollmentTokens: (networkId: string) =>
      request(
        orgId,
        org(`/networks/${networkId}/enrollment-tokens`),
        {},
        enrollmentTokenListResponse,
      ),

    createEnrollmentToken: (
      networkId: string,
      body: CreateEnrollmentTokenBody = {},
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
  };
}

export type ManagementClient = ReturnType<typeof createManagementClient>;
