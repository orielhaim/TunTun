import type { PostureValue } from "@tunnet/api/management";

export type PostureAttributeMap = Map<string, PostureValue>;

type PostureOp =
  | "eq"
  | "neq"
  | "in"
  | "not_in"
  | "gte"
  | "gt"
  | "lte"
  | "lt"
  | "is_set"
  | "not_set"
  | "matches"
  | "contains";

type ParsedAssertion = {
  attribute: string;
  operator: PostureOp;
  expected: PostureValue | null;
};

const ASSERTION_RE =
  /^\s*([a-zA-Z0-9_:.-]+)\s+(==|!=|>=|<=|>|<|IN|NOT IN|IS SET|IS NOT SET|NOT SET|MATCHES|CONTAINS)\s*(.*)$/i;

function parseListValue(raw: string): string[] | null {
  const trimmed = raw.trim();
  const bracketMatch = trimmed.match(/^\[(.*)\]$/s);
  if (!bracketMatch) return null;
  const inner = bracketMatch[1]?.trim();
  if (!inner) return [];
  const items: string[] = [];
  const re = /'([^']*)'|"([^"]*)"|([^,\s]+)/g;
  for (const match of inner.matchAll(re)) {
    const item = match[1] ?? match[2] ?? match[3];
    if (item !== undefined) items.push(item);
  }
  return items;
}

function parseScalarValue(raw: string): PostureValue {
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

function parseAssertion(expression: string): ParsedAssertion | null {
  const trimmed = expression.trim();
  const match = ASSERTION_RE.exec(trimmed);
  if (!match) return null;

  const attribute = match[1];
  const opRaw = match[2]?.toUpperCase();
  const valueRaw = match[3]?.trim() ?? "";
  if (!attribute || !opRaw) return null;

  const operator: PostureOp = (() => {
    switch (opRaw) {
      case "==":
        return "eq";
      case "!=":
        return "neq";
      case "IN":
        return "in";
      case "NOT IN":
        return "not_in";
      case ">=":
        return "gte";
      case ">":
        return "gt";
      case "<=":
        return "lte";
      case "<":
        return "lt";
      case "IS SET":
        return "is_set";
      case "IS NOT SET":
      case "NOT SET":
        return "not_set";
      case "MATCHES":
        return "matches";
      case "CONTAINS":
        return "contains";
      default:
        return "eq";
    }
  })();

  if (operator === "is_set" || operator === "not_set") {
    return { attribute, operator, expected: null };
  }

  const list = parseListValue(valueRaw);
  const expected: PostureValue = list ?? parseScalarValue(valueRaw);
  return { attribute, operator, expected };
}

function compareScalars(
  actual: PostureValue,
  expected: PostureValue,
): number | null {
  const actualNum =
    typeof actual === "number"
      ? actual
      : typeof actual === "string"
        ? Number(actual)
        : null;
  const expectedNum =
    typeof expected === "number"
      ? expected
      : typeof expected === "string"
        ? Number(expected)
        : null;
  if (
    actualNum !== null &&
    !Number.isNaN(actualNum) &&
    expectedNum !== null &&
    !Number.isNaN(expectedNum)
  ) {
    return actualNum - expectedNum;
  }

  const actualStr = String(actual);
  const expectedStr = String(expected);
  return actualStr.localeCompare(expectedStr, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function valuesEqual(actual: PostureValue, expected: PostureValue): boolean {
  if (typeof actual === "boolean" || typeof expected === "boolean") {
    return Boolean(actual) === Boolean(expected);
  }
  if (typeof actual === "number" || typeof expected === "number") {
    const cmp = compareScalars(actual, expected);
    return cmp === 0;
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    return (
      actual.length === expected.length &&
      actual.every((v, i) => v === expected[i])
    );
  }
  return String(actual) === String(expected);
}

function evaluateParsedAssertion(
  parsed: ParsedAssertion,
  attributes: PostureAttributeMap,
): boolean {
  const actual = attributes.get(parsed.attribute);

  switch (parsed.operator) {
    case "is_set":
      return actual !== undefined;
    case "not_set":
      return actual === undefined;
    case "eq":
      return actual !== undefined && parsed.expected !== null
        ? valuesEqual(actual, parsed.expected)
        : false;
    case "neq":
      return actual !== undefined && parsed.expected !== null
        ? !valuesEqual(actual, parsed.expected)
        : false;
    case "in": {
      if (actual === undefined || parsed.expected === null) return false;
      const list = Array.isArray(parsed.expected)
        ? parsed.expected
        : parseListValue(String(parsed.expected));
      if (!list) return false;
      return list.some((item) => valuesEqual(actual, item));
    }
    case "not_in": {
      if (actual === undefined || parsed.expected === null) return true;
      const list = Array.isArray(parsed.expected)
        ? parsed.expected
        : parseListValue(String(parsed.expected));
      if (!list) return true;
      return !list.some((item) => valuesEqual(actual, item));
    }
    case "gte":
    case "gt":
    case "lte":
    case "lt": {
      if (actual === undefined || parsed.expected === null) return false;
      const cmp = compareScalars(actual, parsed.expected);
      if (cmp === null) return false;
      if (parsed.operator === "gte") return cmp >= 0;
      if (parsed.operator === "gt") return cmp > 0;
      if (parsed.operator === "lte") return cmp <= 0;
      return cmp < 0;
    }
    case "matches": {
      if (actual === undefined || parsed.expected === null) return false;
      try {
        const re = new RegExp(String(parsed.expected));
        return re.test(String(actual));
      } catch {
        return false;
      }
    }
    case "contains": {
      if (actual === undefined || parsed.expected === null) return false;
      if (Array.isArray(actual)) {
        return actual.some((item) =>
          valuesEqual(item, String(parsed.expected)),
        );
      }
      return String(actual).includes(String(parsed.expected));
    }
    default:
      return false;
  }
}

export function buildAttributeMap(
  rows: Array<{ namespace: string; key: string; value: unknown }>,
): PostureAttributeMap {
  const map: PostureAttributeMap = new Map();
  for (const row of rows) {
    map.set(`${row.namespace}:${row.key}`, row.value as PostureValue);
  }
  return map;
}

export function evaluateAssertion(
  expression: string,
  attributes: PostureAttributeMap,
): boolean {
  const parsed = parseAssertion(expression);
  if (!parsed) return false;
  return evaluateParsedAssertion(parsed, attributes);
}

export type PostureEvalResult = {
  name: string;
  passed: boolean;
  failingAssertions: string[];
  score: number | null;
};

export function evaluatePostureDefinition(
  name: string,
  assertions: string[],
  attributes: PostureAttributeMap,
): PostureEvalResult {
  const failingAssertions: string[] = [];
  for (const assertion of assertions) {
    if (!evaluateAssertion(assertion, attributes)) {
      failingAssertions.push(assertion);
    }
  }
  const passed = failingAssertions.length === 0;
  const score = passed
    ? 100
    : assertions.length > 0
      ? Math.round(
          ((assertions.length - failingAssertions.length) / assertions.length) *
            100,
        )
      : null;
  return { name, passed, failingAssertions, score };
}

export function computeOverallScore(
  results: PostureEvalResult[],
): number | null {
  if (results.length === 0) return null;
  const total = results.reduce((sum, r) => sum + (r.score ?? 0), 0);
  return Math.round(total / results.length);
}

export const DEFAULT_POSTURE_ORG_SETTINGS = {
  mode: "monitor" as const,
  gracePeriodMinutes: 30,
  recheckOnFailSeconds: 60,
  notifyUser: true,
  notifyAdmin: false,
  autoReauthorize: true,
  defaultSrcPosture: [] as string[],
  scoringWeights: null,
};
