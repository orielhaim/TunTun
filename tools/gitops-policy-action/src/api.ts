import type {
  PolicyApplyResult,
  PolicyDiffResult,
  PolicyDocumentPayload,
  PolicySimulateResult,
  PolicySimulateScenario,
  PolicyValidateResult,
} from "./types";

type PolicyApiClientOptions = {
  baseUrl: string;
  apiKey: string;
  organizationId: string;
};

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

async function request<T>(
  options: PolicyApiClientOptions,
  path: string,
  init: RequestInit,
): Promise<T> {
  const url = `${normalizeBaseUrl(options.baseUrl)}/api/v1/organizations/${options.organizationId}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const body = await parseJsonResponse<T & { error?: string }>(response);
  if (!response.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body && body.error
        ? body.error
        : `Request failed with status ${response.status}`;
    throw new PolicyApiRequestError(message, response.status, body);
  }

  return body;
}

export class PolicyApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = "PolicyApiRequestError";
  }
}

export function createPolicyApiClient(options: PolicyApiClientOptions) {
  return {
    async validate(
      documents: PolicyDocumentPayload[],
    ): Promise<PolicyValidateResult> {
      return request<PolicyValidateResult>(options, "/policy/validate", {
        method: "POST",
        body: JSON.stringify({ documents, runTests: true }),
      });
    },

    async diff(documents: PolicyDocumentPayload[]): Promise<PolicyDiffResult> {
      return request<PolicyDiffResult>(options, "/policy/diff", {
        method: "POST",
        body: JSON.stringify({ documents }),
      });
    },

    async simulate(
      documents: PolicyDocumentPayload[],
      scenarios: PolicySimulateScenario[],
    ): Promise<PolicySimulateResult> {
      return request<PolicySimulateResult>(options, "/policy/simulate", {
        method: "POST",
        body: JSON.stringify({ documents, scenarios }),
      });
    },

    async apply(
      documents: PolicyDocumentPayload[],
      force: boolean,
    ): Promise<PolicyApplyResult> {
      return request<PolicyApplyResult>(options, "/policy/apply", {
        method: "POST",
        body: JSON.stringify({ documents, force }),
      });
    },
  };
}

export type PolicyApiClient = ReturnType<typeof createPolicyApiClient>;
