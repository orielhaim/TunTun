import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createNegativeTestKeys,
  deleteNegativeTestKeys,
  type NegativeTestKeys,
} from "./helpers/fixtures.ts";
import {
  assignedIpPrefix,
  resolveTestEnv,
  waitForServices,
  type TestEnv,
} from "./helpers/env.ts";
import { expectRegisterSuccess, registerSdkNode } from "./helpers/sdk-nodes.ts";

const env = await resolveTestEnv();
const servicesReady = env ? await waitForServices(env) : false;
const runTests = env !== null && servicesReady;

if (!env) {
  console.warn(
    "Skipping SDK tests: set DATABASE_URL and TUNTUN_TEST_SDK_API_KEY in .env",
  );
} else if (!servicesReady) {
  console.warn(
    "Skipping SDK tests: start tuntun-control and the management API, then re-run.",
  );
}

describe.skipIf(!runTests)("SDK API key enrollment", () => {
  let testEnv: TestEnv;
  let negativeKeys: NegativeTestKeys;
  let ipPrefix: string;

  beforeAll(async () => {
    if (!env) {
      throw new Error("Test environment is not configured");
    }
    testEnv = env;
    ipPrefix = assignedIpPrefix(testEnv.networkCidr);
    negativeKeys = await createNegativeTestKeys({
      databaseUrl: testEnv.databaseUrl,
      orgId: testEnv.orgId,
      primaryNetworkId: testEnv.networkId,
    });
  });

  afterAll(async () => {
    if (negativeKeys && testEnv) {
      await deleteNegativeTestKeys({
        databaseUrl: testEnv.databaseUrl,
        otherNetworkId: negativeKeys.otherNetworkId,
        apiKeyIds: negativeKeys.apiKeyIds,
      });
    }
  });

  test("registers an SDK node with a valid API key", async () => {
    const endpointId = randomBytes(32).toString("hex");
    const result = await registerSdkNode({
      managementUrl: testEnv.managementUrl,
      orgId: testEnv.orgId,
      networkId: testEnv.networkId,
      apiKeySecret: testEnv.apiKey,
      endpointId,
      hostname: "bun-test-node",
      processName: "bun-test",
      runtime: `bun ${Bun.version}`,
    });

    const body = expectRegisterSuccess(result);
    expect(body.assignedIp).toStartWith(ipPrefix);
    expect(body.networkId).toBe(testEnv.networkId);
    expect(body.snapshot).toBeDefined();
  }, 15_000);

  test("is idempotent for the same endpoint ID", async () => {
    const endpointId = randomBytes(32).toString("hex");

    const first = expectRegisterSuccess(
      await registerSdkNode({
        managementUrl: testEnv.managementUrl,
        orgId: testEnv.orgId,
        networkId: testEnv.networkId,
        apiKeySecret: testEnv.apiKey,
        endpointId,
        hostname: "bun-test-redeploy",
      }),
    );

    const second = expectRegisterSuccess(
      await registerSdkNode({
        managementUrl: testEnv.managementUrl,
        orgId: testEnv.orgId,
        networkId: testEnv.networkId,
        apiKeySecret: testEnv.apiKey,
        endpointId,
        hostname: "bun-test-redeploy-updated",
        runtime: "bun redeploy",
      }),
    );

    expect(second.assignedIp).toBe(first.assignedIp);
  }, 20_000);

  test("rejects API keys scoped to a different network", async () => {
    const endpointId = randomBytes(32).toString("hex");
    const result = await registerSdkNode({
      managementUrl: testEnv.managementUrl,
      orgId: testEnv.orgId,
      networkId: negativeKeys.otherNetworkId,
      apiKeySecret: negativeKeys.restrictedApiKeySecret,
      endpointId,
      hostname: "bun-test-forbidden-network",
    });

    expect(result.status).toBe(403);
  });

  test("rejects API keys without sdk:enroll scope", async () => {
    const endpointId = randomBytes(32).toString("hex");
    const result = await registerSdkNode({
      managementUrl: testEnv.managementUrl,
      orgId: testEnv.orgId,
      networkId: testEnv.networkId,
      apiKeySecret: negativeKeys.noScopeApiKeySecret,
      endpointId,
      hostname: "bun-test-no-scope",
    });

    expect(result.status).toBe(403);
  });

  test("rejects missing authorization", async () => {
    const endpointId = randomBytes(32).toString("hex");
    const url = `${testEnv.managementUrl}/api/v1/organizations/${testEnv.orgId}/networks/${testEnv.networkId}/sdk-nodes`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpointId,
        hostname: "bun-test-unauth",
      }),
    });

    expect(response.status).toBe(401);
  });
});

describe.skipIf(!runTests)("TunTun SDK native", () => {
  let testEnv: TestEnv;
  let sdk: typeof import("../src/index.ts") | null = null;
  let ipPrefix: string;

  beforeAll(async () => {
    if (!env) {
      throw new Error("Test environment is not configured");
    }
    testEnv = env;
    ipPrefix = assignedIpPrefix(testEnv.networkCidr);

    try {
      sdk = await import("../src/index.ts");
    } catch (error) {
      throw new Error(
        `Failed to load @tuntun/core native bindings. Run: bun run build:native --filter @tuntun/core\n${String(error)}`,
      );
    }
  });

  test("enrolls via TunTunNode.create with an API key", async () => {
    if (!sdk) throw new Error("SDK not loaded");

    const stateDir = await mkdtemp(join(tmpdir(), "tuntun-sdk-create-"));
    try {
      const node = await sdk.TunTunNode.create({
        controlUrl: testEnv.controlUrl,
        managementUrl: testEnv.managementUrl,
        apiKey: testEnv.apiKey,
        organizationId: testEnv.orgId,
        networkId: testEnv.networkId,
        hostname: "bun-sdk-create",
        stateDir,
        standalone: true,
        processName: "bun-test",
        runtime: `bun ${Bun.version}`,
      });

      expect(node.endpointId).toHaveLength(64);
      expect(node.isCoordinator).toBe(true);

      await node.close();
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  }, 30_000);

  test("reuses persisted identity on subsequent create calls", async () => {
    if (!sdk) throw new Error("SDK not loaded");

    const stateDir = await mkdtemp(join(tmpdir(), "tuntun-sdk-reuse-"));
    try {
      const first = await sdk.TunTunNode.create({
        controlUrl: testEnv.controlUrl,
        managementUrl: testEnv.managementUrl,
        apiKey: testEnv.apiKey,
        organizationId: testEnv.orgId,
        networkId: testEnv.networkId,
        hostname: "bun-sdk-reuse",
        stateDir,
        standalone: true,
      });
      const endpointId = first.endpointId;
      await first.close();

      const second = await sdk.TunTunNode.create({
        stateDir,
        standalone: true,
      });
      expect(second.endpointId).toBe(endpointId);
      await second.close();
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  }, 30_000);

  test("enrolls explicitly via enroll()", async () => {
    if (!sdk) throw new Error("SDK not loaded");

    const stateDir = await mkdtemp(join(tmpdir(), "tuntun-sdk-enroll-"));
    try {
      const result = await sdk.enroll({
        controlUrl: testEnv.controlUrl,
        managementUrl: testEnv.managementUrl,
        apiKey: testEnv.apiKey,
        organizationId: testEnv.orgId,
        networkId: testEnv.networkId,
        hostname: "bun-sdk-enroll",
        stateDir,
        processName: "bun-test",
        runtime: `bun ${Bun.version}`,
      });

      expect(result.endpointId).toHaveLength(64);
      expect(result.ip).toStartWith(ipPrefix);
      expect(result.network).toBe(testEnv.networkName);
    } finally {
      await rm(stateDir, { recursive: true, force: true });
    }
  }, 30_000);
});
