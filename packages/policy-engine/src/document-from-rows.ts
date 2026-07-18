import type { PolicyDocument } from "./types";

type Selector =
  | { kind: "any" }
  | { kind: "endpoint"; value: string }
  | { kind: "tag"; value: string }
  | { kind: "network"; value: string }
  | { kind: "cidr"; value: string }
  | { kind: "user_group"; value: string }
  | { kind: "device_group"; value: string }
  | { kind: "user"; value: string };

export function selectorToString(selector: Selector): string {
  switch (selector.kind) {
    case "any":
      return "*";
    case "endpoint":
      return selector.value;
    case "tag":
      return `tag:${selector.value}`;
    case "network":
      return `network:${selector.value}`;
    case "cidr":
      return selector.value;
    case "user_group":
      return `group:user:${selector.value}`;
    case "device_group":
      return `group:device:${selector.value}`;
    case "user":
      return `user:${selector.value}`;
  }
}

function formatPorts(ports: Array<{ start: number; end: number }>): string[] {
  return ports.map((p) =>
    p.start === p.end ? String(p.start) : `${p.start}-${p.end}`,
  );
}

export type PolicyRows = {
  userGroups: Array<{
    name: string;
    members: Array<{ userId: string | null; email: string | null }>;
  }>;
  deviceGroups: Array<{
    name: string;
    members: Array<{ endpointId: string }>;
  }>;
  tags: Array<{ name: string; owners: string[] }>;
  hostAliases: Array<{ name: string; target: string }>;
  ipSets: Array<{ name: string; entries: string[] }>;
  policies: Array<{
    slug: string | null;
    name?: string | null;
    action: string;
    srcSelector: Selector;
    dstSelector: Selector;
    ports: Array<{ start: number; end: number }>;
    protocol: string | null;
    priority: number;
    srcPosture: string[] | null;
    enabled?: boolean;
  }>;
  grants: Array<{
    slug: string;
    principals?: string[];
    srcSelectors?: Selector[];
    appCapabilities?: unknown[];
    ipRules?: unknown[];
  }>;
  sshPolicies: Array<{
    id: string;
    srcSelector: Selector;
    dstSelector: Selector;
    action: string;
    users: string[];
    priority: number;
  }>;
  postures: Array<{ name: string; assertions: string[] }>;
  autoApprovers: Array<{
    slug: string;
    routes: Record<string, string[]>;
    exitNodes: string[];
  }>;
  nodeAttributes: Array<{
    key: string;
    value: string;
    endpointId: string | null;
  }>;
  tests?: PolicyDocument["tests"];
};

export function documentFromRows(rows: PolicyRows): PolicyDocument {
  return {
    user_groups: rows.userGroups.map((group) => ({
      name: group.name,
      members: group.members
        .map((m) => m.email ?? m.userId)
        .filter((m): m is string => Boolean(m)),
    })),
    device_groups: rows.deviceGroups.map((group) => ({
      name: group.name,
      endpoints: group.members.map((m) => m.endpointId),
    })),
    tags: rows.tags.map((tag) => ({
      name: tag.name,
      owners: tag.owners,
    })),
    host_aliases: rows.hostAliases.map((alias) => ({
      name: alias.name,
      target: alias.target,
    })),
    ip_sets: rows.ipSets.map((set) => ({
      name: set.name,
      cidrs: set.entries,
    })),
    acls: rows.policies.map((policy, index) => ({
      name: policy.slug ?? policy.name ?? `acl-${index + 1}`,
      slug: policy.slug ?? undefined,
      action: policy.action,
      src: [selectorToString(policy.srcSelector)],
      dst: [selectorToString(policy.dstSelector)],
      ports: formatPorts(policy.ports),
      protocol: policy.protocol === "any" ? null : policy.protocol,
      priority: policy.priority,
      posture: policy.srcPosture ?? [],
      labels: {},
      enabled: policy.enabled ?? true,
    })),
    grants: rows.grants.map((grant) => ({
      name: grant.slug,
      principals:
        grant.principals ??
        (grant.srcSelectors ?? []).map((sel) => selectorToString(sel)),
      capability:
        Array.isArray(grant.appCapabilities) && grant.appCapabilities.length > 0
          ? String(grant.appCapabilities[0])
          : "",
      ports: [],
      protocol: null,
    })),
    ssh_rules: rows.sshPolicies.map((rule) => ({
      name: rule.id,
      src: [selectorToString(rule.srcSelector)],
      dst: [selectorToString(rule.dstSelector)],
      action: rule.action,
      users: rule.users,
      priority: rule.priority,
      enabled: true,
    })),
    postures: rows.postures.map((posture) => ({
      name: posture.name,
      assertions: posture.assertions,
    })),
    auto_approvers: rows.autoApprovers.flatMap((approver) =>
      Object.entries(approver.routes).map(([route, principals]) => ({
        name: `${approver.slug}-${route}`,
        route,
        principals,
      })),
    ),
    node_attributes: rows.nodeAttributes.map((attr) => ({
      name: attr.key,
      value: attr.value,
      selectors: attr.endpointId ? [`${attr.endpointId}`] : [],
    })),
    tests: rows.tests ?? [],
  };
}
