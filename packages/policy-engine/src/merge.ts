import type { PolicyDocument } from "./types";

export class MergeConflictError extends Error {
  constructor(
    readonly entity: string,
    readonly name: string,
  ) {
    super(`merge conflict: ${entity} '${name}' already exists`);
    this.name = "MergeConflictError";
  }
}

function mergeVec<T>(
  dest: T[],
  src: T[],
  entity: string,
  nameFn: (item: T) => string,
): void {
  for (const item of src) {
    const name = nameFn(item);
    if (dest.some((existing) => nameFn(existing) === name)) {
      throw new MergeConflictError(entity, name);
    }
    dest.push(structuredClone(item));
  }
}

export function mergeDocuments(docs: PolicyDocument[]): PolicyDocument {
  const out: PolicyDocument = {
    user_groups: [],
    device_groups: [],
    tags: [],
    host_aliases: [],
    ip_sets: [],
    acls: [],
    grants: [],
    ssh_rules: [],
    postures: [],
    auto_approvers: [],
    node_attributes: [],
    tests: [],
  };

  for (const doc of docs) {
    mergeVec(out.user_groups, doc.user_groups, "user_group", (g) => g.name);
    mergeVec(
      out.device_groups,
      doc.device_groups,
      "device_group",
      (g) => g.name,
    );
    mergeVec(out.tags, doc.tags, "tag", (t) => t.name);
    mergeVec(out.host_aliases, doc.host_aliases, "host_alias", (h) => h.name);
    mergeVec(out.ip_sets, doc.ip_sets, "ip_set", (s) => s.name);
    mergeVec(out.acls, doc.acls, "acl", (a) => a.slug ?? a.name);
    mergeVec(out.grants, doc.grants, "grant", (g) => g.name);
    mergeVec(out.ssh_rules, doc.ssh_rules, "ssh_rule", (r) => r.name);
    mergeVec(out.postures, doc.postures, "posture", (p) => p.name);
    mergeVec(
      out.auto_approvers,
      doc.auto_approvers,
      "auto_approver",
      (a) => a.name,
    );
    mergeVec(
      out.node_attributes,
      doc.node_attributes,
      "node_attribute",
      (n) => n.name,
    );
    mergeVec(out.tests, doc.tests, "test", (t) => t.name);
  }

  return out;
}
