import { aclKey, type DiffChange, type PolicyDocument } from "./types";

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function diffEntities<T>(
  entity: string,
  left: T[],
  right: T[],
  nameFn: (item: T) => string,
): DiffChange[] {
  const changes: DiffChange[] = [];
  const leftMap = new Map(left.map((item) => [nameFn(item), item]));
  const rightMap = new Map(right.map((item) => [nameFn(item), item]));

  for (const [name, item] of rightMap) {
    const old = leftMap.get(name);
    if (!old) {
      changes.push({ kind: "add", entity, name });
      continue;
    }
    if (stableJson(old) !== stableJson(item)) {
      changes.push({
        kind: "change",
        entity,
        name,
        summary: "fields changed",
      });
    }
  }

  for (const name of leftMap.keys()) {
    if (!rightMap.has(name)) {
      changes.push({ kind: "remove", entity, name });
    }
  }

  return changes;
}

export function diffDocuments(
  a: PolicyDocument,
  b: PolicyDocument,
): DiffChange[] {
  return [
    ...diffEntities("tag", a.tags, b.tags, (t) => t.name),
    ...diffEntities(
      "host_alias",
      a.host_aliases,
      b.host_aliases,
      (h) => h.name,
    ),
    ...diffEntities("ip_set", a.ip_sets, b.ip_sets, (s) => s.name),
    ...diffEntities("acl", a.acls, b.acls, aclKey),
    ...diffEntities("grant", a.grants, b.grants, (g) => g.name),
    ...diffEntities("ssh_rule", a.ssh_rules, b.ssh_rules, (r) => r.name),
    ...diffEntities("posture", a.postures, b.postures, (p) => p.name),
    ...diffEntities(
      "auto_approver",
      a.auto_approvers,
      b.auto_approvers,
      (a) => a.name,
    ),
    ...diffEntities(
      "node_attribute",
      a.node_attributes,
      b.node_attributes,
      (n) => n.name,
    ),
    ...diffEntities("test", a.tests, b.tests, (t) => t.name),
  ];
}
