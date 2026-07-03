#!/usr/bin/env bun
/**
 * TunTun — create an enrollment token
 * =====================================
 *
 * Enrollment tokens are the one-shot secret an agent presents on its
 * *first* connection to the control plane (POST /v1/enroll). The control
 * plane stores only blake3(token) in the `enrollment_tokens` table, never
 * the token itself — so if the DB leaks, the tokens don't.
 *
 * This script:
 *   1. generates a cryptographically-random token
 *   2. blake3-hashes it (matching what the Rust control plane does)
 *   3. either prints the SQL for you to run, or inserts it directly
 *
 * Usage
 * -----
 *   # Print SQL only (safe default, doesn't touch the DB):
 *   bun scripts/create-enrollment-token.ts \
 *       --organization org_dev \
 *       --network 00000000-0000-0000-0000-000000000002
 *
 *   # Insert directly:
 *   DATABASE_URL=postgres://postgres:dev@localhost/postgres \
 *   bun scripts/create-enrollment-token.ts \
 *       --organization org_dev \
 *       --network 00000000-0000-0000-0000-000000000002 \
 *       --insert
 *
 *   # By names instead of IDs (auto-resolves; requires --insert or --lookup):
 *   DATABASE_URL=postgres://... \
 *   bun scripts/create-enrollment-token.ts \
 *       --org-name dev --network-name default --insert
 *
 *   # Custom TTL (default 15 minutes):
 *   bun scripts/create-enrollment-token.ts ... --ttl-min 60
 *
 * Then enroll an agent with:
 *   sudo -E tuntun-agent enroll \
 *       --control-url http://127.0.0.1:8080 \
 *       --token <the-token-printed-below>
 */

import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { blake3 } from "hash-wasm";

const { values: args } = parseArgs({
  options: {
    organization: { type: "string" },
    network: { type: "string" },
    "org-name": { type: "string" },
    "network-name": { type: "string" },
    "ttl-min": { type: "string", default: "15" },
    insert: { type: "boolean", default: false },
    lookup: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  strict: true,
});

if (args.help) {
  console.log(
    await Bun.file(import.meta.path)
      .text()
      .then((t) =>
        t
          .split("*/")[0]
          .replace(/^#!.*\n/, "")
          .replace(/\/\*\*?/g, "")
          .replace(/^ ?\* ?/gm, ""),
      ),
  );
  process.exit(0);
}

const token = randomBytes(32).toString("base64url");
const tokenHashHex = await blake3(Buffer.from(token));

const ttlMin = Number(args["ttl-min"]);
if (!Number.isFinite(ttlMin) || ttlMin <= 0) {
  console.error("--ttl-min must be a positive number");
  process.exit(1);
}

async function resolveIds(): Promise<{
  organizationId: string;
  networkId: string;
}> {
  if (args.organization && args.network) {
    return { organizationId: args.organization, networkId: args.network };
  }

  const needsLookup =
    args["org-name"] ||
    args["network-name"] ||
    !args.organization ||
    !args.network;

  if (!needsLookup) {
    return {
      organizationId: args.organization!,
      networkId: args.network!,
    };
  }

  if (!process.env.DATABASE_URL) {
    console.error(
      "Need either both --organization <id> and --network <uuid>, " +
        "or DATABASE_URL set so we can look them up by name.",
    );
    process.exit(1);
  }

  const { SQL } = await import("bun");
  const sql = new SQL(process.env.DATABASE_URL);

  const orgName = args["org-name"] ?? "dev";
  const networkName = args["network-name"] ?? "default";

  const orgRow = args.organization
    ? [{ id: args.organization }]
    : await sql`SELECT id FROM organization WHERE slug = ${orgName}`;
  if (orgRow.length === 0) {
    console.error(`No organization with slug "${orgName}" found.`);
    process.exit(1);
  }

  const organizationId = orgRow[0].id;
  const networkRow = args.network
    ? [{ id: args.network }]
    : await sql`SELECT id FROM networks WHERE organization_id = ${organizationId} AND name = ${networkName}`;
  if (networkRow.length === 0) {
    console.error(
      `No network named "${networkName}" in organization "${orgName}".`,
    );
    process.exit(1);
  }

  return { organizationId, networkId: networkRow[0].id };
}

const { organizationId, networkId } = await resolveIds();

const insertSql = `
INSERT INTO enrollment_tokens (token_hash, network_id, expires_at)
VALUES (
  '${tokenHashHex}',
  '${networkId}',
  now() + interval '${ttlMin} minutes'
);
`.trim();

if (args.insert) {
  if (!process.env.DATABASE_URL) {
    console.error("--insert requires DATABASE_URL to be set.");
    process.exit(1);
  }
  const { SQL } = await import("bun");
  const sql = new SQL(process.env.DATABASE_URL);
  await sql`
    INSERT INTO enrollment_tokens (token_hash, network_id, expires_at)
    VALUES (${tokenHashHex}, ${networkId}, now() + make_interval(mins => ${ttlMin}))
  `;
  console.log("✓ inserted into enrollment_tokens");
}

const rule = "─".repeat(72);
console.log(rule);
console.log("ENROLLMENT TOKEN (give this to the agent, once):");
console.log();
console.log("  " + token);
console.log();
console.log("Metadata:");
console.log(`  organization_id = ${organizationId}`);
console.log(`  network_id      = ${networkId}`);
console.log(`  ttl             = ${ttlMin} minute(s)`);
console.log(`  blake3(hex)     = ${tokenHashHex}`);
console.log(rule);

if (!args.insert) {
  console.log(
    "SQL to insert (run via psql, or re-run this script with --insert):",
  );
  console.log();
  console.log(insertSql);
  console.log();
  console.log("Example:");
  console.log(
    `  psql "$DATABASE_URL" -c "${insertSql.replace(/\n/g, " ").replace(/"/g, '\\"')}"`,
  );
}

console.log();
console.log("Enroll the agent with:");
console.log(
  `  tuntun-agent enroll --control-url http://127.0.0.1:8080 --token ${token}`,
);
