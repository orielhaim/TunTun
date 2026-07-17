import { existsSync } from "node:fs";
import {
  COMMUNITY_ENTITLEMENTS,
  type Entitlements,
  entitlementsForTier,
  type Feature,
} from "@tunnet/entitlements";
import { verifyLicense } from "@tunnet/entitlements/license";

type Cache = {
  entitlements: Entitlements;
  refreshAtMs: number | null;
};

let cache: Cache | null = null;

async function loadLicenseText(env: NodeJS.ProcessEnv): Promise<string | null> {
  const ref = env.TUNNET_LICENSE?.trim();
  if (!ref) return null;

  try {
    if (ref.startsWith("{")) return ref;

    if (/^https?:\/\//i.test(ref)) {
      const response = await fetch(ref);
      if (!response.ok) {
        console.warn(
          `[entitlements] TUNNET_LICENSE fetch failed: ${response.status}`,
        );
        return null;
      }
      return await response.text();
    }

    if (!existsSync(ref)) {
      console.warn(`[entitlements] TUNNET_LICENSE file not found: ${ref}`);
      return null;
    }
    return await Bun.file(ref).text();
  } catch (err) {
    console.warn(
      "[entitlements] failed to load TUNNET_LICENSE:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

async function resolveEntitlements(
  env: NodeJS.ProcessEnv,
  nowMs: number,
): Promise<Entitlements> {
  const text = await loadLicenseText(env);
  if (!text) return COMMUNITY_ENTITLEMENTS;

  const verified = verifyLicense(text, Math.floor(nowMs / 1000));
  if (!verified) {
    console.warn(
      "[entitlements] TUNNET_LICENSE invalid or malformed; using community",
    );
    return COMMUNITY_ENTITLEMENTS;
  }

  if (verified.expired) {
    console.warn(
      `[entitlements] license expired at ${new Date(verified.payload.exp * 1000).toISOString()}; using community`,
    );
    return COMMUNITY_ENTITLEMENTS;
  }

  return entitlementsForTier(verified.payload.tier, verified.payload.exp);
}

export async function getEntitlements(): Promise<Entitlements> {
  const now = Date.now();
  if (cache && (cache.refreshAtMs === null || now < cache.refreshAtMs)) {
    return cache.entitlements;
  }

  const entitlements = await resolveEntitlements(process.env, now);
  cache = {
    entitlements,
    refreshAtMs:
      entitlements.licenseExpiresAt != null
        ? entitlements.licenseExpiresAt * 1000
        : null,
  };
  return entitlements;
}

/** Whether a feature is unlocked for the active license. */
export async function hasFeature(feature: Feature): Promise<boolean> {
  const entitlements = await getEntitlements();
  return entitlements[feature] === true;
}

export function clearEntitlementsCache(): void {
  cache = null;
}
