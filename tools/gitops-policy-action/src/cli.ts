import { spawn } from "node:child_process";

import type { PolicyValidateResult } from "./types";

function runCommand(
  command: string,
  args: string[],
  cwd?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export async function isTunnetCliAvailable(): Promise<boolean> {
  try {
    const result = await runCommand("tunnet", ["--version"]);
    return result.code === 0;
  } catch {
    return false;
  }
}

export async function validateWithCli(
  policyPath: string,
): Promise<PolicyValidateResult> {
  const result = await runCommand("tunnet", ["policy", "validate", policyPath]);

  if (result.code === 0) {
    return { valid: true };
  }

  const message =
    result.stderr.trim() || result.stdout.trim() || "Validation failed";
  return {
    valid: false,
    errors: [{ message }],
  };
}

export async function testWithCli(
  policyPath: string,
): Promise<PolicyValidateResult> {
  const result = await runCommand("tunnet", ["policy", "test", policyPath]);

  if (result.code === 0) {
    return {
      valid: true,
      tests: { passed: 1, failed: 0 },
    };
  }

  const message =
    result.stderr.trim() || result.stdout.trim() || "Tests failed";
  return {
    valid: false,
    tests: { passed: 0, failed: 1 },
    errors: [{ message }],
  };
}
