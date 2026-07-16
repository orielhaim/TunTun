import { existsSync } from "node:fs";
import {
  COMMUNITY_ENTITLEMENTS,
  type Entitlements,
  entitlementsForTier,
  parseLicenseTier,
} from "@tuntun/entitlements";
import { getRepoRoot, hasCloudPackages } from "@tuntun/env";

type LicenseDocument = {
  tier?: unknown;
};

let cached: Entitlements | null = null;

/**
 * Load license from `TUNTUN_LICENSE` (file path or https URL).
 * Missing / invalid → community.
 */
async function loadLicenseDocument(
  env: NodeJS.ProcessEnv,
): Promise<LicenseDocument | null> {
  const ref = env.TUNTUN_LICENSE?.trim();
  if (!ref) return null;

  try {
    if (/^https?:\/\//i.test(ref)) {
      const response = await fetch(ref);
      if (!response.ok) {
        console.warn(
          `[entitlements] TUNTUN_LICENSE fetch failed: ${response.status}`,
        );
        return null;
      }
      return (await response.json()) as LicenseDocument;
    }

    if (!existsSync(ref)) {
      console.warn(`[entitlements] TUNTUN_LICENSE file not found: ${ref}`);
      return null;
    }
    return (await Bun.file(ref).json()) as LicenseDocument;
  } catch (err) {
    console.warn(
      "[entitlements] failed to load TUNTUN_LICENSE:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Resolve product entitlements from the license document only.
 * No license → community.
 */
export async function resolveEntitlements(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Entitlements> {
  const doc = await loadLicenseDocument(env);
  const tier = parseLicenseTier(doc?.tier) ?? "community";
  let entitlements = entitlementsForTier(tier);

  // Landing UI lives in private-only cloud/; never claim it without that code.
  if (entitlements.cloudLanding && !hasCloudPackages(getRepoRoot())) {
    entitlements = { ...entitlements, cloudLanding: false };
  }

  return entitlements;
}

export async function getEntitlements(): Promise<Entitlements> {
  if (!cached) {
    cached = await resolveEntitlements();
  }
  return cached;
}

/** Test helper / hot-reload. */
export function clearEntitlementsCache(): void {
  cached = null;
}

export function assertCanCreateOrganization(
  entitlements: Entitlements,
  existingOrgCount: number,
): void {
  if (entitlements.multiOrganization) return;
  if (existingOrgCount >= 1) {
    throw new Error(
      "Community license allows a single organization. Upgrade to enable multi-organization.",
    );
  }
}

export { COMMUNITY_ENTITLEMENTS };
