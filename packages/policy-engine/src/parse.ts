import { parse as parseYaml } from "yaml";

import { type PolicyDocument, policyDocumentSchema } from "./types";

export type DocumentFormat = "json" | "yaml" | "hcl";

export function parseJsonDocument(content: string): PolicyDocument {
  const parsed: unknown = JSON.parse(content);
  return policyDocumentSchema.parse(parsed);
}

export function parseDocument(
  format: DocumentFormat,
  content: string,
): PolicyDocument {
  switch (format) {
    case "json":
      return parseJsonDocument(content);
    case "yaml":
      return policyDocumentSchema.parse(parseYaml(content));
    case "hcl":
      throw new Error(
        "HCL parsing is not supported in @tunnet/policy-engine; use JSON or YAML",
      );
    default:
      throw new Error(`unsupported format: ${format satisfies never}`);
  }
}
