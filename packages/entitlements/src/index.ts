export type LicenseTier = "community" | "cloud" | "enterprise";

export type Entitlements = {
  tier: LicenseTier;
  /** Allow creating and switching between multiple organizations. */
  multiOrganization: boolean;
  /** SaaS marketing landing at `/` (requires cloud/ dashboard package). */
  cloudLanding: boolean;
};

export type EntitlementOverrides = Partial<Entitlements> & {
  tier?: LicenseTier;
};

export const COMMUNITY_ENTITLEMENTS: Entitlements = {
  tier: "community",
  multiOrganization: false,
  cloudLanding: false,
};

/** Cloud license: multi-org + marketing landing. */
export const CLOUD_ENTITLEMENTS: Entitlements = {
  tier: "cloud",
  multiOrganization: true,
  cloudLanding: true,
};

/** Enterprise license: no extra product features yet. */
export const ENTERPRISE_ENTITLEMENTS: Entitlements = {
  tier: "enterprise",
  multiOrganization: false,
  cloudLanding: false,
};

export function entitlementsForTier(tier: LicenseTier): Entitlements {
  switch (tier) {
    case "cloud":
      return { ...CLOUD_ENTITLEMENTS };
    case "enterprise":
      return { ...ENTERPRISE_ENTITLEMENTS };
    default:
      return { ...COMMUNITY_ENTITLEMENTS };
  }
}

export function mergeEntitlements(
  base: Entitlements,
  overrides: EntitlementOverrides | null | undefined,
): Entitlements {
  if (!overrides) return base;
  return {
    ...base,
    ...overrides,
    tier: overrides.tier ?? base.tier,
  };
}

export function parseLicenseTier(value: unknown): LicenseTier | null {
  if (value === "community" || value === "cloud" || value === "enterprise") {
    return value;
  }
  return null;
}
