import { simulateDocument } from "./simulate";
import type { PolicyDocument, TestResults } from "./types";

function splitDst(dst: string): {
  selector: string;
  port?: number;
  protocol: string;
} {
  const parts = dst.split(":");
  if (parts.length >= 2) {
    const last = parts[parts.length - 1] ?? "";
    const portPart = last.split("/")[0] ?? "";
    const port = Number.parseInt(portPart, 10);
    if (!Number.isNaN(port) && port > 0) {
      const selector = parts.slice(0, -1).join(":");
      const protocol = last.split("/")[1] ?? "tcp";
      return { selector, port, protocol };
    }
  }
  return { selector: dst, protocol: "tcp" };
}

export function runTests(doc: PolicyDocument): TestResults {
  const results = [];
  let passed = 0;
  let failed = 0;

  for (const test of doc.tests) {
    const messages: string[] = [];

    for (const dst of test.accept) {
      const { selector, port, protocol } = splitDst(dst);
      const result = simulateDocument(doc, {
        src: test.src,
        dst: selector,
        port,
        protocol,
      });
      if (result.verdict !== "allow") {
        messages.push(
          `expected allow for dst '${dst}', got ${result.verdict} (rules: ${result.matchedRules.join(", ")})`,
        );
      }
    }

    for (const dst of test.deny) {
      const { selector, port, protocol } = splitDst(dst);
      const result = simulateDocument(doc, {
        src: test.src,
        dst: selector,
        port,
        protocol,
      });
      if (result.verdict !== "deny") {
        messages.push(
          `expected deny for dst '${dst}', got ${result.verdict} (rules: ${result.matchedRules.join(", ")})`,
        );
      }
    }

    const ok = messages.length === 0;
    if (ok) {
      passed += 1;
    } else {
      failed += 1;
    }
    results.push({
      name: test.name,
      passed: ok,
      message: ok ? undefined : messages.join("; "),
    });
  }

  return { passed, failed, results };
}
