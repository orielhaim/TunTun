/**
 * Dashboard helpers for posture UI. Schemas/types come from `@tunnet/api/management`.
 */
import type {
  ComplianceOverviewResponse,
  PatchPostureOrgSettingsBody,
  PostureAttribute,
  PostureOrgSettings,
  PostureStatusResponse,
  PostureValue,
} from "@tunnet/api/management";

import {
  getAttributeByKey,
  OPERATOR_LABELS,
  type PostureOperator,
} from "@/lib/posture-attributes";

export type {
  ComplianceOverviewResponse,
  CreatePostureDefinitionBody,
  CreatePostureIntegrationBody,
  PatchPostureOrgSettingsBody,
  PostureAttribute,
  PostureDefinition,
  PostureIntegration,
  PostureOrgSettings,
  PostureStatusResponse,
  PostureValue,
  UpdatePostureDefinitionBody,
  UpdatePostureIntegrationBody,
} from "@tunnet/api/management";

export {
  complianceOverviewResponse,
  createPostureDefinitionBody,
  createPostureIntegrationBody,
  listDevicePostureResponse,
  patchCustomPostureBody,
  patchPostureOrgSettingsBody,
  postureDefinitionListResponse,
  postureDefinitionSchema,
  postureIntegrationListResponse,
  postureIntegrationSchema,
  postureIntegrationSyncResponse,
  postureOrgSettingsResponse,
  postureStatusResponse,
  updatePostureDefinitionBody,
  updatePostureIntegrationBody,
} from "@tunnet/api/management";

export type DevicePosture = {
  attributes: PostureAttribute[];
};

export type DevicePostureStatus = PostureStatusResponse;

export type CreatePostureBody = {
  name: string;
  description?: string;
  assertions: string[];
};

export type UpdatePostureBody = {
  description?: string | null;
  assertions?: string[];
};

export type PostureCompliance = {
  organizationId: string;
  totalDevices: number;
  compliantDevices: number;
  nonCompliantDevices: number;
  devices: Array<{
    endpointId: string;
    name: string;
    passing: number;
    failing: number;
    total: number;
    overallScore: number | null;
  }>;
  /** Derived for UI convenience */
  compliant: number;
  nonCompliant: number;
  unknown: number;
  complianceRate: number;
};

export type PatchPostureSettingsBody = PatchPostureOrgSettingsBody;
export type PostureSettings = PostureOrgSettings;
export type PatchCustomPostureAttributeBody = {
  value: PostureValue;
  expiresIn?: number;
};

export function formatPostureAttributeKey(attr: PostureAttribute): string {
  return `${attr.namespace}:${attr.key}`;
}

export function formatPostureValue(value: PostureValue): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

/** Split textarea lines into assertion strings (API stores string[]). */
export function parseAssertionLines(lines: string): string[] {
  return lines
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

export function serializeAssertions(assertions: string[]): string {
  return assertions.join("\n");
}

export type AssertionRowMode = "builder" | "custom";

export type AssertionRow = {
  id: string;
  mode: AssertionRowMode;
  attribute: string;
  operator: PostureOperator;
  /** Scalar bool/string/number, or string[] for IN/NOT IN. Null for IS SET / IS NOT SET. */
  value: boolean | string | number | string[] | null;
  /** Used when mode === "custom". */
  customExpression: string;
};

const ASSERTION_PARSE_RE =
  /^\s*([a-zA-Z0-9_:.-]+)\s+(==|!=|>=|<=|>|<|IN|NOT IN|IS SET|IS NOT SET|NOT SET|MATCHES|CONTAINS)\s*(.*)$/i;

function newRowId(): string {
  return crypto.randomUUID();
}

function parseListLiteral(raw: string): string[] | null {
  const trimmed = raw.trim();
  const bracket = trimmed.match(/^\[(.*)\]$/s);
  if (!bracket) return null;
  const inner = bracket[1]?.trim();
  if (!inner) return [];
  const items: string[] = [];
  const re = /'([^']*)'|"([^"]*)"|([^,\s]+)/g;
  for (const match of inner.matchAll(re)) {
    const item = match[1] ?? match[2] ?? match[3];
    if (item !== undefined) items.push(item);
  }
  return items;
}

function parseScalarLiteral(raw: string): boolean | string | number {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  const quoted =
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'));
  if (quoted) return trimmed.slice(1, -1);
  return trimmed;
}

function normalizeOperator(opRaw: string): PostureOperator {
  const upper = opRaw.toUpperCase();
  if (upper === "NOT SET") return "IS NOT SET";
  return upper as PostureOperator;
}

export function createEmptyAssertionRow(
  partial?: Partial<AssertionRow>,
): AssertionRow {
  return {
    id: newRowId(),
    mode: "builder",
    attribute: "device:diskEncryption",
    operator: "==",
    value: true,
    customExpression: "",
    ...partial,
  };
}

export function parseAssertionExpression(expression: string): AssertionRow {
  const trimmed = expression.trim();
  const match = ASSERTION_PARSE_RE.exec(trimmed);
  if (!match) {
    return createEmptyAssertionRow({
      mode: "custom",
      customExpression: trimmed,
      attribute: "",
      operator: "==",
      value: null,
    });
  }

  const attribute = match[1] ?? "";
  const operator = normalizeOperator(match[2] ?? "==");
  const valueRaw = match[3]?.trim() ?? "";

  if (operator === "IS SET" || operator === "IS NOT SET") {
    return createEmptyAssertionRow({
      attribute,
      operator,
      value: null,
    });
  }

  if (operator === "IN" || operator === "NOT IN") {
    const list = parseListLiteral(valueRaw);
    return createEmptyAssertionRow({
      attribute,
      operator,
      value: list ?? (valueRaw ? [String(parseScalarLiteral(valueRaw))] : []),
    });
  }

  return createEmptyAssertionRow({
    attribute,
    operator,
    value: valueRaw === "" ? "" : parseScalarLiteral(valueRaw),
  });
}

export function parseAssertionsToRows(assertions: string[]): AssertionRow[] {
  if (assertions.length === 0) {
    return [createEmptyAssertionRow()];
  }
  return assertions.map((a) => parseAssertionExpression(a));
}

function formatScalar(value: boolean | string | number): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (/^-?\d+(\.\d+)?$/.test(value) || value === "true" || value === "false") {
    return value;
  }
  const escaped = value.replace(/'/g, "\\'");
  return `'${escaped}'`;
}

function formatList(values: string[]): string {
  return `[${values.map((v) => formatScalar(v)).join(", ")}]`;
}

export function serializeAssertionRow(row: AssertionRow): string | null {
  if (row.mode === "custom") {
    const expr = row.customExpression.trim();
    return expr.length > 0 ? expr : null;
  }
  if (!row.attribute.trim()) return null;

  if (row.operator === "IS SET" || row.operator === "IS NOT SET") {
    return `${row.attribute} ${row.operator}`;
  }

  if (row.operator === "IN" || row.operator === "NOT IN") {
    const list = Array.isArray(row.value)
      ? row.value
      : row.value == null || row.value === ""
        ? []
        : [String(row.value)];
    return `${row.attribute} ${row.operator} ${formatList(list)}`;
  }

  if (row.value === null || row.value === undefined) return null;
  if (Array.isArray(row.value)) {
    return `${row.attribute} ${row.operator} ${formatList(row.value)}`;
  }
  return `${row.attribute} ${row.operator} ${formatScalar(row.value)}`;
}

export function serializeAssertionRows(rows: AssertionRow[]): string[] {
  return rows
    .map(serializeAssertionRow)
    .filter((s): s is string => s != null && s.length > 0);
}

/** Human-readable summary for a single assertion / row. */
export function describeAssertion(input: string | AssertionRow): string {
  const row =
    typeof input === "string" ? parseAssertionExpression(input) : input;

  if (row.mode === "custom") {
    return row.customExpression.trim() || "Custom expression";
  }

  const attr = getAttributeByKey(row.attribute);
  const label = attr?.label ?? row.attribute;
  const opLabel = OPERATOR_LABELS[row.operator] ?? row.operator;

  if (row.operator === "IS SET") return `${label} must be set`;
  if (row.operator === "IS NOT SET") return `${label} must not be set`;

  if (row.operator === "IN" || row.operator === "NOT IN") {
    const list = Array.isArray(row.value) ? row.value : [];
    const joined = list.length > 0 ? list.join(", ") : "…";
    return row.operator === "IN"
      ? `${label} must be one of: ${joined}`
      : `${label} must not be one of: ${joined}`;
  }

  if (attr?.valueType === "bool" && row.operator === "==") {
    return row.value === true
      ? `${label} must be enabled`
      : `${label} must be disabled`;
  }
  if (attr?.valueType === "bool" && row.operator === "!=") {
    return row.value === true
      ? `${label} must not be enabled`
      : `${label} must not be disabled`;
  }

  const valueText =
    row.value === null || row.value === undefined
      ? "…"
      : Array.isArray(row.value)
        ? row.value.join(", ")
        : String(row.value);

  return `${label} ${opLabel} ${valueText}`;
}

export function describeAssertionsSummary(assertions: string[]): string {
  if (assertions.length === 0) return "No rules";
  const firstAssertion = assertions[0];
  if (firstAssertion === undefined) return "No rules";
  const first = describeAssertion(firstAssertion);
  if (assertions.length === 1) return first;
  return `${first} · +${assertions.length - 1} more`;
}

export function deriveOverallStatus(
  status: PostureStatusResponse | undefined,
): "compliant" | "partial" | "non_compliant" | "unknown" {
  if (!status || status.postures.length === 0) return "unknown";
  const passed = status.postures.filter((p) => p.passed).length;
  if (passed === status.postures.length) return "compliant";
  if (passed === 0) return "non_compliant";
  return "partial";
}

export function normalizeCompliance(
  raw: ComplianceOverviewResponse,
): PostureCompliance {
  const compliant = raw.compliantDevices;
  const nonCompliant = raw.nonCompliantDevices;
  const total = raw.totalDevices;
  const unknown = Math.max(0, total - compliant - nonCompliant);
  return {
    ...raw,
    compliant,
    nonCompliant,
    unknown,
    complianceRate: total > 0 ? (compliant / total) * 100 : 0,
  };
}
