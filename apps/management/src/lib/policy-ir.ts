import type { PolicyDocumentInput } from "@tunnet/api/management";
import { schema } from "@tunnet/db";
import {
  documentFromRows,
  mergeDocuments,
  type PolicyDocument,
  type PolicyRows,
  parseDocument,
} from "@tunnet/policy-engine";
import { eq, inArray, sql } from "drizzle-orm";
import { writeAudit } from "./audit";
import { db } from "./db";
import { bumpOrgAndNotify } from "./notify";

type Selector =
  | { kind: "any" }
  | { kind: "endpoint"; value: string }
  | { kind: "tag"; value: string }
  | { kind: "network"; value: string }
  | { kind: "cidr"; value: string }
  | { kind: "user_group"; value: string }
  | { kind: "device_group"; value: string }
  | { kind: "user"; value: string };

function parseSelectorString(raw: string): Selector {
  const s = raw.trim();
  if (s === "*") return { kind: "any" };
  if (s.startsWith("tag:")) return { kind: "tag", value: s.slice(4) };
  if (s.startsWith("user:")) return { kind: "user", value: s.slice(5) };
  if (s.startsWith("group:user:")) {
    return { kind: "user_group", value: s.slice(11) };
  }
  if (s.startsWith("group:device:")) {
    return { kind: "device_group", value: s.slice(13) };
  }
  if (s.startsWith("network:")) {
    return { kind: "network", value: s.slice(8) };
  }
  if (s.includes("/")) {
    return { kind: "cidr", value: s };
  }
  if (/^[0-9a-fA-F]{16,64}$/.test(s)) {
    return { kind: "endpoint", value: s };
  }
  return { kind: "tag", value: s };
}

function parsePortRanges(
  ports: string[],
): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  for (const spec of ports) {
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

export function parsePolicyDocuments(
  documents: PolicyDocumentInput[],
): PolicyDocument {
  const parsed = documents.map((doc) => parseDocument(doc.format, doc.content));
  return mergeDocuments(parsed);
}

export async function loadOrganizationPolicyDocument(
  organizationId: string,
): Promise<PolicyDocument> {
  const [
    userGroupRows,
    deviceGroupRows,
    tagRows,
    hostAliasRows,
    ipSetRows,
    policyRows,
    grantRows,
    autoApproverRows,
    postureRows,
    nodeAttributeRows,
    networks,
  ] = await Promise.all([
    db.query.userGroups.findMany({
      where: eq(schema.userGroups.organizationId, organizationId),
    }),
    db.query.deviceGroups.findMany({
      where: eq(schema.deviceGroups.organizationId, organizationId),
    }),
    db.query.tagDefinitions.findMany({
      where: eq(schema.tagDefinitions.organizationId, organizationId),
    }),
    db.query.hostAliases.findMany({
      where: eq(schema.hostAliases.organizationId, organizationId),
    }),
    db.query.ipSets.findMany({
      where: eq(schema.ipSets.organizationId, organizationId),
    }),
    db.query.policies.findMany({
      where: eq(schema.policies.organizationId, organizationId),
    }),
    db.query.grants.findMany({
      where: eq(schema.grants.organizationId, organizationId),
    }),
    db.query.autoApprovers.findMany({
      where: eq(schema.autoApprovers.organizationId, organizationId),
    }),
    db.query.postureDefinitions.findMany({
      where: eq(schema.postureDefinitions.organizationId, organizationId),
    }),
    db.query.nodeAttributes.findMany({
      where: eq(schema.nodeAttributes.organizationId, organizationId),
    }),
    db.query.networks.findMany({
      where: eq(schema.networks.organizationId, organizationId),
    }),
  ]);

  const userGroupIds = userGroupRows.map((g) => g.id);
  const deviceGroupIds = deviceGroupRows.map((g) => g.id);
  const networkIds = networks.map((n) => n.id);

  const [userGroupMemberRows, deviceGroupMemberRows, sshPolicyRows] =
    await Promise.all([
      userGroupIds.length > 0
        ? db.query.userGroupMembers.findMany({
            where: inArray(schema.userGroupMembers.groupId, userGroupIds),
          })
        : Promise.resolve([]),
      deviceGroupIds.length > 0
        ? db.query.deviceGroupMembers.findMany({
            where: inArray(schema.deviceGroupMembers.groupId, deviceGroupIds),
          })
        : Promise.resolve([]),
      networkIds.length > 0
        ? db.query.sshPolicies.findMany({
            where: inArray(schema.sshPolicies.networkId, networkIds),
          })
        : Promise.resolve([]),
    ]);

  const membersByUserGroup = new Map<
    string,
    Array<{ userId: string | null; email: string | null }>
  >();
  for (const member of userGroupMemberRows) {
    const list = membersByUserGroup.get(member.groupId) ?? [];
    list.push({ userId: member.userId, email: member.email });
    membersByUserGroup.set(member.groupId, list);
  }

  const membersByDeviceGroup = new Map<string, Array<{ endpointId: string }>>();
  for (const member of deviceGroupMemberRows) {
    const list = membersByDeviceGroup.get(member.groupId) ?? [];
    list.push({ endpointId: member.endpointId });
    membersByDeviceGroup.set(member.groupId, list);
  }

  const rows: PolicyRows = {
    userGroups: userGroupRows.map((group) => ({
      name: group.name,
      members: membersByUserGroup.get(group.id) ?? [],
    })),
    deviceGroups: deviceGroupRows.map((group) => ({
      name: group.name,
      members: membersByDeviceGroup.get(group.id) ?? [],
    })),
    tags: tagRows.map((tag) => ({
      name: tag.name,
      owners: tag.owners,
    })),
    hostAliases: hostAliasRows.map((alias) => ({
      name: alias.name,
      target: alias.target,
    })),
    ipSets: ipSetRows.map((set) => ({
      name: set.name,
      entries: set.entries,
    })),
    policies: policyRows.map((policy) => ({
      slug: policy.slug,
      action: policy.action,
      srcSelector: policy.srcSelector as Selector,
      dstSelector: policy.dstSelector as Selector,
      ports: policy.ports as Array<{ start: number; end: number }>,
      protocol: policy.protocol,
      priority: policy.priority,
      srcPosture: policy.srcPosture,
    })),
    grants: grantRows.map((grant) => ({
      slug: grant.slug,
      srcSelectors: grant.srcSelectors as Selector[],
      appCapabilities: grant.appCapabilities as unknown[],
      ipRules: grant.ipRules as unknown[],
    })),
    sshPolicies: sshPolicyRows.map((rule) => ({
      id: rule.id,
      srcSelector: rule.srcSelector as Selector,
      dstSelector: rule.dstSelector as Selector,
      action: rule.action,
      users: rule.users as string[],
      priority: rule.priority,
    })),
    postures: postureRows.map((posture) => ({
      name: posture.name,
      assertions: posture.assertions,
    })),
    autoApprovers: autoApproverRows.map((approver) => ({
      slug: approver.slug,
      routes: approver.routes,
      exitNodes: approver.exitNodes,
    })),
    nodeAttributes: nodeAttributeRows.map((attr) => ({
      key: attr.key,
      value: attr.value,
      endpointId: attr.endpointId,
    })),
  };

  return documentFromRows(rows);
}

export async function applyPolicyDocument(input: {
  organizationId: string;
  document: PolicyDocument;
  source: "dashboard" | "api" | "gitops" | "terraform";
  userId: string | null;
  apiKeyId: string | null;
  contentHash: string;
}): Promise<{ revisionId: string }> {
  const networks = await db.query.networks.findMany({
    where: eq(schema.networks.organizationId, input.organizationId),
  });
  const networkIds = networks.map((n) => n.id);

  return db.transaction(async (tx) => {
    await tx
      .delete(schema.userGroups)
      .where(eq(schema.userGroups.organizationId, input.organizationId));
    await tx
      .delete(schema.deviceGroups)
      .where(eq(schema.deviceGroups.organizationId, input.organizationId));
    await tx
      .delete(schema.tagDefinitions)
      .where(eq(schema.tagDefinitions.organizationId, input.organizationId));
    await tx
      .delete(schema.hostAliases)
      .where(eq(schema.hostAliases.organizationId, input.organizationId));
    await tx
      .delete(schema.ipSets)
      .where(eq(schema.ipSets.organizationId, input.organizationId));
    await tx
      .delete(schema.grants)
      .where(eq(schema.grants.organizationId, input.organizationId));
    await tx
      .delete(schema.autoApprovers)
      .where(eq(schema.autoApprovers.organizationId, input.organizationId));
    await tx
      .delete(schema.nodeAttributes)
      .where(eq(schema.nodeAttributes.organizationId, input.organizationId));
    await tx
      .delete(schema.policies)
      .where(eq(schema.policies.organizationId, input.organizationId));
    await tx
      .delete(schema.postureDefinitions)
      .where(
        eq(schema.postureDefinitions.organizationId, input.organizationId),
      );

    if (networkIds.length > 0) {
      await tx
        .delete(schema.sshPolicies)
        .where(inArray(schema.sshPolicies.networkId, networkIds));
    }

    for (const group of input.document.user_groups) {
      const [created] = await tx
        .insert(schema.userGroups)
        .values({
          organizationId: input.organizationId,
          name: group.name,
        })
        .returning();
      if (!created) continue;
      if (group.members.length > 0) {
        await tx
          .insert(schema.userGroupMembers)
          .values(
            group.members.map((member) =>
              member.includes("@")
                ? { groupId: created.id, email: member }
                : { groupId: created.id, userId: member },
            ),
          );
      }
    }

    for (const group of input.document.device_groups) {
      const [created] = await tx
        .insert(schema.deviceGroups)
        .values({
          organizationId: input.organizationId,
          name: group.name,
        })
        .returning();
      if (!created || group.endpoints.length === 0) continue;
      await tx.insert(schema.deviceGroupMembers).values(
        group.endpoints.map((endpointId) => ({
          groupId: created.id,
          endpointId,
        })),
      );
    }

    for (const tag of input.document.tags) {
      await tx.insert(schema.tagDefinitions).values({
        organizationId: input.organizationId,
        name: tag.name,
        owners: tag.owners,
      });
    }

    for (const alias of input.document.host_aliases) {
      await tx.insert(schema.hostAliases).values({
        organizationId: input.organizationId,
        name: alias.name,
        target: alias.target,
      });
    }

    for (const set of input.document.ip_sets) {
      await tx.insert(schema.ipSets).values({
        organizationId: input.organizationId,
        name: set.name,
        entries: set.cidrs,
      });
    }

    for (const posture of input.document.postures) {
      await tx.insert(schema.postureDefinitions).values({
        organizationId: input.organizationId,
        name: posture.name,
        assertions: posture.assertions,
      });
    }

    for (const acl of input.document.acls) {
      await tx.insert(schema.policies).values({
        organizationId: input.organizationId,
        networkId: null,
        scope: "organization",
        slug: acl.slug ?? acl.name,
        srcSelector: parseSelectorString(acl.src[0] ?? "*"),
        dstSelector: parseSelectorString(acl.dst[0] ?? "*"),
        action: acl.action,
        ports: parsePortRanges(acl.ports),
        protocol: acl.protocol ?? "any",
        priority: acl.priority,
        srcPosture: acl.posture.length > 0 ? acl.posture : null,
      });
    }

    for (const grant of input.document.grants) {
      await tx.insert(schema.grants).values({
        organizationId: input.organizationId,
        slug: grant.name,
        srcSelectors: grant.principals.map((p) => parseSelectorString(p)),
        dstSelectors: [],
        ipRules: [],
        appCapabilities: grant.capability ? [grant.capability] : [],
        priority: 0,
        enabled: true,
      });
    }

    const approversBySlug = new Map<
      string,
      { routes: Record<string, string[]>; exitNodes: string[] }
    >();
    for (const approver of input.document.auto_approvers) {
      const slug = approver.name.split("-")[0] ?? approver.name;
      const existing = approversBySlug.get(slug) ?? {
        routes: {},
        exitNodes: [],
      };
      if (approver.route) {
        existing.routes[approver.route] = approver.principals;
      }
      approversBySlug.set(slug, existing);
    }
    for (const [slug, data] of approversBySlug) {
      await tx.insert(schema.autoApprovers).values({
        organizationId: input.organizationId,
        slug,
        routes: data.routes,
        exitNodes: data.exitNodes,
      });
    }

    for (const attr of input.document.node_attributes) {
      const endpointId = attr.selectors[0] ?? null;
      await tx.insert(schema.nodeAttributes).values({
        organizationId: input.organizationId,
        endpointId,
        key: attr.name,
        value: attr.value,
      });
    }

    if (networkIds.length > 0) {
      for (const rule of input.document.ssh_rules) {
        for (const networkId of networkIds) {
          await tx.insert(schema.sshPolicies).values({
            networkId,
            srcSelector: parseSelectorString(rule.src[0] ?? "*"),
            dstSelector: parseSelectorString(rule.dst[0] ?? "*"),
            action: rule.action,
            users: rule.users,
            priority: rule.priority,
          });
        }
      }
    }

    const [{ maxVersion }] = await tx
      .select({
        maxVersion: sql<number>`coalesce(max(${schema.policyRevisions.version}), 0)`,
      })
      .from(schema.policyRevisions)
      .where(eq(schema.policyRevisions.organizationId, input.organizationId));

    const [revision] = await tx
      .insert(schema.policyRevisions)
      .values({
        organizationId: input.organizationId,
        version: Number(maxVersion ?? 0) + 1,
        contentHash: input.contentHash,
        irSnapshot: input.document,
        source: input.source,
        authorUserId: input.userId,
        authorApiKeyId: input.apiKeyId,
      })
      .returning();

    if (!revision) {
      throw new Error("Failed to create policy revision");
    }

    await writeAudit(tx, {
      organizationId: input.organizationId,
      actor: input.userId ?? input.apiKeyId ?? "system",
      action: "policy.applied",
      target: revision.id,
      metadata: { contentHash: input.contentHash, source: input.source },
    });

    await bumpOrgAndNotify(tx, input.organizationId);

    return { revisionId: revision.id };
  });
}
