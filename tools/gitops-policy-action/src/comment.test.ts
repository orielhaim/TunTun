import { describe, expect, test } from "bun:test";

import { formatPrComment } from "./comment";

describe("formatPrComment", () => {
  test("formats validation, diff, simulation, and apply sections", () => {
    const body = formatPrComment({
      policyLabel: "policies/prod.yaml",
      validation: {
        valid: true,
        warnings: [
          { path: "acls.x.src", message: "empty src matches nothing" },
        ],
        tests: {
          passed: 1,
          failed: 0,
          results: [{ name: "eng-can-reach", passed: true }],
        },
      },
      diff: {
        changes: [
          {
            kind: "add",
            entity: "acl",
            name: "allow-eng",
            summary: "new rule",
          },
          { kind: "remove", entity: "acl", name: "old-rule" },
          { kind: "change", entity: "tag", name: "staging" },
        ],
        impact: { devicesAffected: 3, connectionsBroken: 1 },
      },
      simulation: {
        scenarios: [
          {
            name: "eng to staging",
            src: "group:user:eng",
            dst: "tag:staging",
            port: 443,
            verdict: "allow",
            matchedRules: ["allow-eng"],
          },
        ],
      },
      applyMessage: "Applied revision rev_123",
    });

    expect(body).toContain("## Tunnet policy check");
    expect(body).toContain("Policy path: `policies/prod.yaml`");
    expect(body).toContain("✅ Policy document is valid.");
    expect(body).toContain("⚠️ `acls.x.src`: empty src matches nothing");
    expect(body).toContain("**Tests:** 1 passed, 0 failed");
    expect(body).toContain("- ✅ eng-can-reach");
    expect(body).toContain("➕ **add** `acl/allow-eng` - new rule");
    expect(body).toContain("➖ **remove** `acl/old-rule`");
    expect(body).toContain("📝 **change** `tag/staging`");
    expect(body).toContain("Devices affected: 3");
    expect(body).toContain("Connections potentially broken: 1");
    expect(body).toContain("| eng to staging | ✅ allow | allow-eng |");
    expect(body).toContain("## Apply");
    expect(body).toContain("Applied revision rev_123");
    expect(body).toContain("tunnet-policy");
  });

  test("formats failed validation without optional sections", () => {
    const body = formatPrComment({
      policyLabel: "policy.json",
      validation: {
        valid: false,
        errors: [{ path: "acls.bad", message: "unknown tag 'x'" }],
      },
    });

    expect(body).toContain("❌ Policy validation failed.");
    expect(body).toContain("- `acls.bad`: unknown tag 'x'");
    expect(body).not.toContain("## Semantic diff");
    expect(body).not.toContain("## Simulation");
    expect(body).not.toContain("## Apply");
  });
});
