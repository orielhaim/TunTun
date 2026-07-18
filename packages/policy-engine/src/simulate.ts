import {
  parseSelector,
  selectorMatches,
  simulationEndpoint,
  simulationTags,
} from "./selector";
import {
  type AclRule,
  aclKey,
  type PolicyDocument,
  type SimulateResult,
} from "./types";

type CompiledRule = {
  name: string;
  action: "allow" | "deny";
  srcSelectors: ReturnType<typeof parseSelector>[];
  dstSelectors: ReturnType<typeof parseSelector>[];
  ports: Array<{ start: number; end: number }>;
  protocol: "tcp" | "udp" | "icmp" | "any";
  priority: number;
  posture: string[];
  enabled: boolean;
};

function parsePorts(specs: string[]): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  for (const spec of specs) {
    const single = Number.parseInt(spec, 10);
    if (!Number.isNaN(single)) {
      out.push({ start: single, end: single });
      continue;
    }
    const dash = spec.split("-");
    if (dash.length === 2) {
      const start = Number.parseInt(dash[0] ?? "", 10);
      const end = Number.parseInt(dash[1] ?? "", 10);
      if (!Number.isNaN(start) && !Number.isNaN(end)) {
        out.push({ start, end });
      }
    }
  }
  return out;
}

function parseProtocol(proto: string): CompiledRule["protocol"] {
  switch (proto.toLowerCase()) {
    case "tcp":
      return "tcp";
    case "udp":
      return "udp";
    case "icmp":
      return "icmp";
    default:
      return "any";
  }
}

function compileRules(doc: PolicyDocument): CompiledRule[] {
  const rules: CompiledRule[] = [];
  for (const acl of doc.acls.filter((a) => a.enabled)) {
    const srcs = acl.src.length > 0 ? acl.src : ["*"];
    const dsts = acl.dst.length > 0 ? acl.dst : ["*"];
    for (const src of srcs) {
      for (const dst of dsts) {
        rules.push({
          name: aclKey(acl),
          action: acl.action === "deny" ? "deny" : "allow",
          srcSelectors: [parseSelector(src)],
          dstSelectors: [parseSelector(dst)],
          ports: parsePorts(acl.ports),
          protocol: acl.protocol ? parseProtocol(acl.protocol) : "any",
          priority: acl.priority,
          posture: acl.posture,
          enabled: acl.enabled,
        });
      }
    }
  }
  return rules;
}

function endpointForSelector(sel: ReturnType<typeof parseSelector>): string {
  return (
    simulationEndpoint(sel) ??
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  );
}

function tagsForSelector(sel: ReturnType<typeof parseSelector>): string[] {
  return simulationTags(sel);
}

function portMatches(
  ports: Array<{ start: number; end: number }>,
  port: number | undefined,
): boolean {
  if (ports.length === 0) {
    return true;
  }
  if (port === undefined) {
    return false;
  }
  return ports.some((range) => port >= range.start && port <= range.end);
}

function evaluateRules(
  rules: CompiledRule[],
  srcEndpoint: string,
  srcTags: string[],
  dstEndpoint: string,
  dstTags: string[],
  port: number | undefined,
  protocol: string,
): SimulateResult {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  const parsedProto = parseProtocol(protocol);

  for (const rule of sorted) {
    const srcMatch = rule.srcSelectors.some((sel) =>
      selectorMatches(sel, srcEndpoint, srcTags),
    );
    const dstMatch = rule.dstSelectors.some((sel) =>
      selectorMatches(sel, dstEndpoint, dstTags),
    );
    if (!srcMatch || !dstMatch) {
      continue;
    }
    if (rule.protocol !== "any" && rule.protocol !== parsedProto) {
      continue;
    }
    if (!portMatches(rule.ports, port)) {
      continue;
    }
    return {
      verdict: rule.action,
      matchedRules: [rule.name],
    };
  }

  return { verdict: "deny", matchedRules: [] };
}

export function simulateDocument(
  doc: PolicyDocument,
  scenario: {
    src: string;
    dst: string;
    port?: number;
    protocol?: string;
  },
): SimulateResult {
  const rules = compileRules(doc);
  const srcSel = parseSelector(scenario.src);
  const dstSel = parseSelector(scenario.dst);
  return evaluateRules(
    rules,
    endpointForSelector(srcSel),
    tagsForSelector(srcSel),
    endpointForSelector(dstSel),
    tagsForSelector(dstSel),
    scenario.port,
    scenario.protocol ?? "tcp",
  );
}

export function compileAclRules(doc: PolicyDocument): AclRule[] {
  return doc.acls;
}
