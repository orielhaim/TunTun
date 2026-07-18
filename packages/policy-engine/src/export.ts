import { stringify as stringifyYaml } from "yaml";

import type { PolicyDocument } from "./types";

function renderStringList(items: string[]): string {
  return `[${items.map((s) => `"${s}"`).join(", ")}]`;
}

export function exportJson(doc: PolicyDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function exportYaml(doc: PolicyDocument): string {
  return stringifyYaml(doc);
}

export function exportHcl(doc: PolicyDocument): string {
  let out = "";

  for (const group of doc.user_groups) {
    out += `user_group "${group.name}" {\n`;
    if (group.members.length > 0) {
      out += `  members = ${renderStringList(group.members)}\n`;
    }
    out += "}\n\n";
  }

  for (const group of doc.device_groups) {
    out += `device_group "${group.name}" {\n`;
    if (group.endpoints.length > 0) {
      out += `  endpoints = ${renderStringList(group.endpoints)}\n`;
    }
    out += "}\n\n";
  }

  for (const tag of doc.tags) {
    out += `tag "${tag.name}" {\n`;
    if (tag.owners.length > 0) {
      out += `  owners = ${renderStringList(tag.owners)}\n`;
    }
    out += "}\n\n";
  }

  for (const alias of doc.host_aliases) {
    out += `host_alias "${alias.name}" {\n`;
    out += `  target = "${alias.target}"\n`;
    out += "}\n\n";
  }

  for (const set of doc.ip_sets) {
    out += `ip_set "${set.name}" {\n`;
    if (set.cidrs.length > 0) {
      out += `  cidrs = ${renderStringList(set.cidrs)}\n`;
    }
    out += "}\n\n";
  }

  for (const acl of doc.acls) {
    out += `acl "${acl.name}" {\n`;
    out += `  action   = "${acl.action}"\n`;
    out += `  priority = ${acl.priority}\n`;
    if (acl.src.length > 0) {
      out += `  src      = ${renderStringList(acl.src)}\n`;
    }
    if (acl.dst.length > 0) {
      out += `  dst      = ${renderStringList(acl.dst)}\n`;
    }
    if (acl.ports.length > 0) {
      out += `  ports    = ${renderStringList(acl.ports)}\n`;
    }
    if (acl.protocol) {
      out += `  protocol = "${acl.protocol}"\n`;
    }
    if (!acl.enabled) {
      out += "  enabled  = false\n";
    }
    out += "}\n\n";
  }

  for (const test of doc.tests) {
    out += `test "${test.name}" {\n`;
    out += `  src = "${test.src}"\n`;
    if (test.accept.length > 0) {
      out += `  accept = ${renderStringList(test.accept)}\n`;
    }
    if (test.deny.length > 0) {
      out += `  deny   = ${renderStringList(test.deny)}\n`;
    }
    out += "}\n\n";
  }

  return out;
}

export function exportDocument(
  doc: PolicyDocument,
  format: "json" | "yaml" | "hcl",
): string {
  switch (format) {
    case "json":
      return exportJson(doc);
    case "yaml":
      return exportYaml(doc);
    case "hcl":
      return exportHcl(doc);
    default:
      throw new Error(`unsupported export format: ${format satisfies never}`);
  }
}
