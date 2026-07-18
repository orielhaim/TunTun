import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import type { PolicyDocumentPayload } from "./types";

const POLICY_EXTENSIONS = new Set([".hcl", ".json", ".yaml", ".yml"]);

function formatFromPath(filePath: string): PolicyDocumentPayload["format"] {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".yaml" || ext === ".yml") return "yaml";
  return "hcl";
}

async function collectPolicyFiles(
  root: string,
): Promise<Array<{ path: string; content: string }>> {
  const info = await stat(root);
  if (info.isFile()) {
    const content = await readFile(root, "utf8");
    return [{ path: root, content }];
  }

  const files: Array<{ path: string; content: string }> = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = extname(entry.name).toLowerCase();
      if (!POLICY_EXTENSIONS.has(ext)) continue;
      const content = await readFile(fullPath, "utf8");
      files.push({ path: fullPath, content });
    }
  }

  await walk(root);
  if (files.length === 0) {
    throw new Error(`No policy files found under ${root}`);
  }
  return files;
}

const ORG_ID_PATTERNS = [
  /organization_id\s*=\s*"([^"]+)"/,
  /"organizationId"\s*:\s*"([^"]+)"/,
  /organizationId:\s*['"]?([a-zA-Z0-9_-]+)/,
];

export function extractOrganizationId(
  files: Array<{ path: string; content: string }>,
): string | undefined {
  for (const file of files) {
    for (const pattern of ORG_ID_PATTERNS) {
      const match = file.content.match(pattern);
      if (match?.[1]) return match[1];
    }
  }
  return process.env.TUNNET_ORG_ID;
}

export async function loadPolicyDocuments(
  policyPath: string,
): Promise<PolicyDocumentPayload[]> {
  const files = await collectPolicyFiles(policyPath);
  return files.map((file) => ({
    path: file.path,
    format: formatFromPath(file.path),
    content: file.content,
    baseRevision: process.env.TUNNET_POLICY_BASE_REVISION,
  }));
}

export function primaryPolicyLabel(documents: PolicyDocumentPayload[]): string {
  if (documents.length === 1) {
    return basename(documents[0].path);
  }
  return `${documents.length} files`;
}
