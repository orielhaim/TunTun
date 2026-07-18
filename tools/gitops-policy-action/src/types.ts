export type PolicyValidateResult = {
  valid: boolean;
  errors?: Array<{ path?: string; message: string }>;
  warnings?: Array<{ path?: string; message: string }>;
  tests?: {
    passed: number;
    failed: number;
    results?: Array<{ name: string; passed: boolean; message?: string }>;
  };
};

export type PolicyDiffChange = {
  kind: "add" | "change" | "remove";
  entity: string;
  name: string;
  summary?: string;
};

export type PolicyDiffResult = {
  changes: PolicyDiffChange[];
  impact?: {
    devicesAffected?: number;
    connectionsBroken?: number;
  };
};

export type PolicySimulateScenario = {
  name?: string;
  src: string;
  dst: string;
  port?: number;
  protocol?: string;
};

export type PolicySimulateResult = {
  scenarios: Array<{
    name?: string;
    src: string;
    dst: string;
    port?: number;
    protocol?: string;
    verdict: "allow" | "deny";
    matchedRules?: string[];
    posture?: { passed: boolean; details?: string };
  }>;
};

export type PolicyApplyResult = {
  revisionId?: string;
  applied: boolean;
  message?: string;
};

export type PolicyDocumentPayload = {
  path: string;
  format: "hcl" | "json" | "yaml";
  content: string;
  baseRevision?: string;
};

export type PolicyApiError = {
  error: string;
  drift?: unknown;
};
