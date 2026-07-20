import { describe, expect, test } from "bun:test";

import {
  contentHash,
  diffDocuments,
  documentFromRows,
  emptyDocument,
  exportDocument,
  MergeConflictError,
  mergeDocuments,
  type PolicyDocument,
  type PolicyRows,
  parseDocument,
  parseJsonDocument,
  simulateDocument,
  validateDocument,
} from "./index";

function sampleDoc(): PolicyDocument {
  return {
    ...emptyDocument(),
    tags: [
      { name: "eng", owners: ["a@x.com"] },
      { name: "staging", owners: [] },
    ],
    acls: [
      {
        name: "allow-eng-staging",
        action: "allow",
        src: ["tag:eng"],
        dst: ["tag:staging"],
        ports: ["443"],
        protocol: "tcp",
        priority: 100,
        posture: [],
        labels: {},
        enabled: true,
      },
      {
        name: "default-deny",
        action: "deny",
        src: ["*"],
        dst: ["*"],
        ports: [],
        protocol: null,
        priority: 1,
        posture: [],
        labels: {},
        enabled: true,
      },
    ],
  };
}

describe("parseJsonDocument + validateDocument", () => {
  test("valid document parses and validates", () => {
    const doc = parseJsonDocument(JSON.stringify(sampleDoc()));
    const result = validateDocument(doc);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("invalid document fails validation", () => {
    const doc = {
      ...emptyDocument(),
      acls: [
        {
          name: "bad",
          action: "allow",
          src: ["tag:missing"],
          dst: ["*"],
          ports: [],
          protocol: null,
          priority: 1,
          posture: [],
          labels: {},
          enabled: true,
        },
      ],
    };
    const parsed = parseJsonDocument(JSON.stringify(doc));
    const result = validateDocument(parsed);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("missing"))).toBe(true);
  });
});

describe("mergeDocuments", () => {
  test("conflicts on duplicate tag name", () => {
    const a = {
      ...emptyDocument(),
      tags: [{ name: "eng", owners: ["a@x.com"] }],
    };
    const b = {
      ...emptyDocument(),
      tags: [{ name: "eng", owners: ["b@x.com"] }],
    };
    expect(() => mergeDocuments([a, b])).toThrow(MergeConflictError);
    try {
      mergeDocuments([a, b]);
    } catch (error) {
      expect(error).toBeInstanceOf(MergeConflictError);
      expect((error as MergeConflictError).name).toBe("MergeConflictError");
      expect((error as MergeConflictError).entity).toBe("tag");
      expect((error as MergeConflictError).message).toContain("eng");
    }
  });
});

describe("simulateDocument", () => {
  test("allow matching rule", () => {
    const result = simulateDocument(sampleDoc(), {
      src: "tag:eng",
      dst: "tag:staging",
      port: 443,
      protocol: "tcp",
    });
    expect(result.verdict).toBe("allow");
    expect(result.matchedRules).toEqual(["allow-eng-staging"]);
  });

  test("deny when unmatched", () => {
    const result = simulateDocument(sampleDoc(), {
      src: "tag:eng",
      dst: "tag:prod",
      port: 443,
      protocol: "tcp",
    });
    expect(result.verdict).toBe("deny");
  });
});

describe("contentHash", () => {
  test("is stable across calls", async () => {
    const doc = sampleDoc();
    const h1 = await contentHash(doc);
    const h2 = await contentHash(doc);
    expect(h1).toBe(h2);
    expect(h1.length).toBeGreaterThan(0);
  });
});

describe("YAML parse/export round-trip", () => {
  test("exportDocument yaml then parseDocument restores content", async () => {
    const doc = sampleDoc();
    const yaml = exportDocument(doc, "yaml");
    const parsed = parseDocument("yaml", yaml);
    expect(await contentHash(doc)).toBe(await contentHash(parsed));
    expect(parsed.acls.map((a) => a.name)).toEqual([
      "allow-eng-staging",
      "default-deny",
    ]);
  });
});

describe("diffDocuments", () => {
  test("detects acl add/remove/change", () => {
    const a = {
      ...emptyDocument(),
      acls: [
        {
          name: "keep",
          action: "allow",
          src: ["*"],
          dst: ["*"],
          ports: [],
          protocol: null,
          priority: 10,
          posture: [],
          labels: {},
          enabled: true,
        },
        {
          name: "gone",
          action: "allow",
          src: ["*"],
          dst: ["*"],
          ports: [],
          protocol: null,
          priority: 5,
          posture: [],
          labels: {},
          enabled: true,
        },
      ],
    };
    const b = {
      ...emptyDocument(),
      acls: [
        {
          name: "keep",
          action: "deny",
          src: ["*"],
          dst: ["*"],
          ports: [],
          protocol: null,
          priority: 10,
          posture: [],
          labels: {},
          enabled: true,
        },
        {
          name: "new",
          action: "allow",
          src: ["*"],
          dst: ["*"],
          ports: [],
          protocol: null,
          priority: 20,
          posture: [],
          labels: {},
          enabled: true,
        },
      ],
    };

    const changes = diffDocuments(a, b);
    expect(
      changes.some(
        (c) => c.kind === "add" && c.entity === "acl" && c.name === "new",
      ),
    ).toBe(true);
    expect(
      changes.some(
        (c) => c.kind === "remove" && c.entity === "acl" && c.name === "gone",
      ),
    ).toBe(true);
    expect(
      changes.some(
        (c) =>
          c.kind === "change" &&
          c.entity === "acl" &&
          c.name === "keep" &&
          c.summary === "fields changed",
      ),
    ).toBe(true);
  });
});

describe("documentFromRows", () => {
  test("maps fixture rows into a policy document", () => {
    const rows: PolicyRows = {
      tags: [
        { name: "eng", owners: ["a@x.com"] },
        { name: "staging", owners: ["tag:eng"] },
      ],
      hostAliases: [{ name: "db", target: "tag:staging" }],
      ipSets: [{ name: "office", entries: ["10.0.0.0/8"] }],
      policies: [
        {
          slug: "allow-eng",
          action: "allow",
          srcSelector: { kind: "tag", value: "eng" },
          dstSelector: { kind: "tag", value: "staging" },
          ports: [{ start: 443, end: 443 }],
          protocol: "tcp",
          priority: 100,
          srcPosture: null,
          enabled: true,
        },
      ],
      grants: [],
      sshPolicies: [],
      postures: [{ name: "disk", assertions: ["encrypted"] }],
      autoApprovers: [],
      nodeAttributes: [],
    };

    const doc = documentFromRows(rows);
    expect(doc.tags).toEqual([
      { name: "eng", owners: ["a@x.com"] },
      { name: "staging", owners: ["tag:eng"] },
    ]);
    expect(doc.acls[0]?.src).toEqual(["tag:eng"]);
    expect(doc.acls[0]?.dst).toEqual(["tag:staging"]);
    expect(doc.acls[0]?.ports).toEqual(["443"]);
    expect(doc.postures[0]?.name).toBe("disk");
  });
});
