import * as core from "@actions/core";
import * as github from "@actions/github";

import { createPolicyApiClient, PolicyApiRequestError } from "./api";
import { isTunnetCliAvailable, testWithCli, validateWithCli } from "./cli";
import { formatPrComment } from "./comment";
import {
  extractOrganizationId,
  loadPolicyDocuments,
  primaryPolicyLabel,
} from "./policy";
import type {
  PolicyDiffResult,
  PolicySimulateResult,
  PolicySimulateScenario,
  PolicyValidateResult,
} from "./types";

type ActionMode = "test" | "apply";

function readInput(name: string, envName: string, fallback = ""): string {
  return (
    process.env[envName]?.trim() ||
    core.getInput(name, { required: false }).trim() ||
    fallback
  );
}

function readBooleanInput(
  name: string,
  envName: string,
  fallback: boolean,
): boolean {
  const raw = readInput(name, envName);
  if (!raw) return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

function parseActionMode(value: string): ActionMode {
  if (value === "apply") return "apply";
  if (value === "test") return "test";
  throw new Error(`Invalid action "${value}". Expected "test" or "apply".`);
}

function parseScenarios(raw: string): PolicySimulateScenario[] {
  if (!raw || raw === "[]") return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("simulate-scenarios must be a JSON array");
    }
    return parsed as PolicySimulateScenario[];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    throw new Error(`Failed to parse simulate-scenarios: ${message}`);
  }
}

function mergeValidation(
  local: PolicyValidateResult,
  remote?: PolicyValidateResult,
): PolicyValidateResult {
  if (!remote) return local;
  return {
    valid: local.valid && remote.valid,
    errors: [...(local.errors ?? []), ...(remote.errors ?? [])],
    warnings: [...(local.warnings ?? []), ...(remote.warnings ?? [])],
    tests: remote.tests ?? local.tests,
  };
}

async function postPrComment(body: string): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    core.warning("GITHUB_TOKEN is not set; skipping PR comment.");
    return;
  }

  const context = github.context;
  if (context.eventName !== "pull_request" || !context.payload.pull_request) {
    core.info("Not a pull request event; skipping PR comment.");
    return;
  }

  const octokit = github.getOctokit(token);
  const issueNumber = context.payload.pull_request.number;

  const comments = await octokit.rest.issues.listComments({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: issueNumber,
  });

  const marker = "## Tunnet policy check";
  const existing = comments.data.find((comment) =>
    comment.body?.includes(marker),
  );

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      comment_id: existing.id,
      body,
    });
    return;
  }

  await octokit.rest.issues.createComment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: issueNumber,
    body,
  });
}

async function run(): Promise<void> {
  const mode = parseActionMode(readInput("action", "INPUT_ACTION", "test"));
  const policyPath = readInput("policy-path", "INPUT_POLICY_PATH", ".tunnet");
  const apiUrl =
    readInput("tunnet-api-url", "INPUT_TUNNET_API_URL") ||
    process.env.TUNNET_API_URL ||
    "";
  const apiKey =
    readInput("tunnet-api-key", "INPUT_TUNNET_API_KEY") ||
    process.env.TUNNET_API_KEY ||
    "";
  const commentOnPr = readBooleanInput(
    "comment-on-pr",
    "INPUT_COMMENT_ON_PR",
    true,
  );
  const force = readBooleanInput("force", "INPUT_FORCE", false);
  const scenarios = parseScenarios(
    readInput("simulate-scenarios", "INPUT_SIMULATE_SCENARIOS", "[]"),
  );

  const documents = await loadPolicyDocuments(policyPath);
  const policyLabel = primaryPolicyLabel(documents);
  const organizationId = extractOrganizationId(
    documents.map((doc) => ({ path: doc.path, content: doc.content })),
  );

  let validation: PolicyValidateResult = { valid: true };
  const cliAvailable = await isTunnetCliAvailable();

  if (cliAvailable) {
    core.info("Running local `tunnet policy validate`");
    validation = await validateWithCli(policyPath);
    if (mode === "test" && validation.valid) {
      const tests = await testWithCli(policyPath);
      validation = mergeValidation(validation, tests);
    }
  } else {
    core.info("Tunnet CLI not found; using Management API for validation");
  }

  let diff: PolicyDiffResult | undefined;
  let simulation: PolicySimulateResult | undefined;

  const needsApi =
    !cliAvailable ||
    mode === "test" ||
    mode === "apply" ||
    scenarios.length > 0;

  if (needsApi) {
    if (!apiUrl) {
      throw new Error(
        "tunnet-api-url (or TUNNET_API_URL) is required when the CLI is unavailable or for diff/apply/simulate.",
      );
    }
    if (!apiKey) {
      throw new Error(
        "tunnet-api-key (or TUNNET_API_KEY) is required when the CLI is unavailable or for diff/apply/simulate.",
      );
    }
    if (!organizationId) {
      throw new Error(
        "organization_id must be present in the policy document or TUNNET_ORG_ID must be set.",
      );
    }

    const client = createPolicyApiClient({
      baseUrl: apiUrl,
      apiKey,
      organizationId,
    });

    if (!cliAvailable) {
      const remoteValidation = await client.validate(documents);
      validation = mergeValidation(validation, remoteValidation);
    }

    if (mode === "test") {
      diff = await client.diff(documents);
      if (scenarios.length > 0) {
        simulation = await client.simulate(documents, scenarios);
      }
    }

    if (mode === "apply") {
      if (!validation.valid) {
        throw new Error("Refusing to apply invalid policy document.");
      }

      try {
        const result = await client.apply(documents, force);
        core.setOutput("revision-id", result.revisionId ?? "");
        core.info(result.message ?? "Policy applied successfully.");

        if (commentOnPr) {
          await postPrComment(
            formatPrComment({
              policyLabel,
              validation,
              applyMessage: result.message ?? "✅ Policy applied.",
            }),
          );
        }
        return;
      } catch (error) {
        if (error instanceof PolicyApiRequestError && error.status === 409) {
          core.setFailed(
            `Drift detected: ${error.message}. Re-run with force: true to overwrite.`,
          );
          return;
        }
        throw error;
      }
    }
  }

  if (!validation.valid) {
    core.setFailed("Policy validation failed.");
  }

  core.setOutput("valid", String(validation.valid));
  core.setOutput("changes", String(diff?.changes.length ?? 0));

  if (commentOnPr && mode === "test") {
    await postPrComment(
      formatPrComment({
        policyLabel,
        validation,
        diff,
        simulation,
      }),
    );
  }

  if (!validation.valid) {
    process.exitCode = 1;
  }
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  core.setFailed(message);
});
