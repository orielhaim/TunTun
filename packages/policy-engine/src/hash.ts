import type { PolicyDocument } from "./types";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      const child = record[key];
      if (
        child === undefined ||
        (Array.isArray(child) && child.length === 0) ||
        (typeof child === "object" &&
          child !== null &&
          !Array.isArray(child) &&
          Object.keys(child).length === 0)
      ) {
        continue;
      }
      out[key] = canonicalize(child);
    }
    return out;
  }
  return value;
}

export async function contentHash(doc: PolicyDocument): Promise<string> {
  const canonical = canonicalize(doc);
  const bytes = new TextEncoder().encode(JSON.stringify(canonical));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function canonicalJson(doc: PolicyDocument): string {
  return JSON.stringify(canonicalize(doc), null, 2);
}
