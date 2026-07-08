import { createHmac, createHash, randomBytes } from "node:crypto";

import {
  internalHealthResponse,
  internalReadyResponse,
  registerDeviceResponse,
  validateNetworkResponse,
  type InternalHealthResponse,
  type InternalReadyResponse,
  type RegisterDeviceBody,
  type RegisterDeviceResponse,
  type ValidateNetworkResponse,
} from "@tuntun/api/internal";
import ky, { isHTTPError, type KyInstance } from "ky";

const HDR_TIMESTAMP = "x-tuntun-timestamp";
const HDR_NONCE = "x-tuntun-nonce";
const HDR_SIGNATURE = "x-tuntun-signature";

function getAdminUrl(): string {
  const url = process.env.CONTROL_PLANE_ADMIN_URL;
  if (!url) {
    throw new Error("CONTROL_PLANE_ADMIN_URL is not set");
  }
  return url.replace(/\/$/, "");
}

function getServiceSecret(): string {
  const secret = process.env.TUNTUN_SERVICE_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("TUNTUN_SERVICE_SECRET must be at least 32 characters");
  }
  return secret;
}

function signRequest(
  method: string,
  path: string,
  body: string,
): Record<string, string> {
  const secret = getServiceSecret();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const canonical = `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
  const signature = createHmac("sha256", secret)
    .update(canonical)
    .digest("hex");

  return {
    [HDR_TIMESTAMP]: timestamp,
    [HDR_NONCE]: nonce,
    [HDR_SIGNATURE]: signature,
  };
}

function formatErrorBody(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  if (data === undefined || data === null) {
    return "";
  }
  return JSON.stringify(data);
}

function createSignedClient(): KyInstance {
  return ky.create({
    baseUrl: getAdminUrl(),
    retry: 0,
    hooks: {
      beforeRequest: [
        async ({ request }) => {
          const url = new URL(request.url);
          const path = url.pathname;
          const method = request.method.toUpperCase();
          const body =
            request.method === "GET" || request.method === "HEAD"
              ? ""
              : await request.clone().text();
          const authHeaders = signRequest(method, path, body);
          for (const [key, value] of Object.entries(authHeaders)) {
            request.headers.set(key, value);
          }
        },
      ],
      beforeError: [
        ({ error }) => {
          if (isHTTPError(error)) {
            const path = new URL(error.request.url).pathname;
            const detail = formatErrorBody(error.data);
            return new Error(
              `Control plane ${error.request.method} ${path} failed: ${error.response.status}${detail ? ` ${detail}` : ""}`,
            );
          }
          return error;
        },
      ],
    },
  });
}

let client: KyInstance | undefined;

function getClient(): KyInstance {
  client ??= createSignedClient();
  return client;
}

export async function getControlPlaneHealth(): Promise<InternalHealthResponse> {
  const data = await getClient().get("/internal/v1/health").json();
  return internalHealthResponse.parse(data);
}

export async function getControlPlaneReady(): Promise<InternalReadyResponse> {
  const data = await getClient().get("/internal/v1/ready").json();
  return internalReadyResponse.parse(data);
}

export async function validateNetwork(
  networkId: string,
): Promise<ValidateNetworkResponse> {
  const data = await getClient()
    .post(`/internal/v1/networks/${networkId}/validate`, { body: "" })
    .json();
  return validateNetworkResponse.parse(data);
}

function toSnakeRegisterBody(
  body: RegisterDeviceBody,
): Record<string, unknown> {
  return {
    endpoint_id: body.endpointId,
    organization_id: body.organizationId,
    network_id: body.networkId,
    hostname: body.hostname,
    os: body.os ?? "",
    agent_version: body.agentVersion ?? "",
    device_type: body.deviceType,
    metadata: body.metadata,
  };
}

function parseRegisterDeviceResponse(data: unknown): RegisterDeviceResponse {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid register device response");
  }
  const raw = data as Record<string, unknown>;
  return registerDeviceResponse.parse({
    organizationId: raw.organization_id ?? raw.organizationId,
    networkId: raw.network_id ?? raw.networkId,
    networkName: raw.network_name ?? raw.networkName,
    snapshot: raw.snapshot,
  });
}

export async function registerDevice(
  body: RegisterDeviceBody,
): Promise<RegisterDeviceResponse> {
  const data = await getClient()
    .post("/internal/v1/devices/register", {
      json: toSnakeRegisterBody(body),
    })
    .json();
  return parseRegisterDeviceResponse(data);
}
