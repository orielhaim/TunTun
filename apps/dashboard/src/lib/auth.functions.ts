import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { entitlementsSchema } from "@tuntun/api/management";
import {
  COMMUNITY_ENTITLEMENTS,
  type Entitlements,
} from "@tuntun/entitlements";

import { authClient } from "@/lib/auth-client";
import { getManagementApiUrl } from "@/lib/env";

function authFetchOptions() {
  return {
    headers: getRequestHeaders(),
    credentials: "include" as const,
  };
}

async function fetchSession() {
  const { data } = await authClient.getSession({
    fetchOptions: authFetchOptions(),
  });
  return data;
}

export const getSession = createServerFn({ method: "GET" }).handler(async () =>
  fetchSession(),
);

export const getEntitlements = createServerFn({ method: "GET" }).handler(
  async (): Promise<Entitlements> => {
    try {
      const response = await fetch(
        `${getManagementApiUrl()}/api/v1/entitlements`,
        { headers: getRequestHeaders() },
      );
      if (!response.ok) return COMMUNITY_ENTITLEMENTS;
      const data: unknown = await response.json();
      const parsed = entitlementsSchema.safeParse(data);
      return parsed.success ? parsed.data : COMMUNITY_ENTITLEMENTS;
    } catch {
      return COMMUNITY_ENTITLEMENTS;
    }
  },
);

export const ensureSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await fetchSession();
    if (!session) {
      throw new Error("Unauthorized");
    }
    return session;
  },
);

export const listOrganizations = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data } = await authClient.organization.list({
      fetchOptions: authFetchOptions(),
    });
    return data ?? [];
  },
);

export const bootstrapAppSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await fetchSession();
    if (!session) {
      return { authenticated: false as const };
    }

    const { data: organizations } = await authClient.organization.list({
      fetchOptions: authFetchOptions(),
    });
    const orgs = organizations ?? [];

    if (orgs.length === 0) {
      return {
        authenticated: true as const,
        session,
        organizations: orgs,
        needsOnboarding: true as const,
      };
    }

    if (!session.session.activeOrganizationId && orgs[0]) {
      await authClient.organization.setActive({
        organizationId: orgs[0].id,
        fetchOptions: authFetchOptions(),
      });
    }

    return {
      authenticated: true as const,
      session,
      organizations: orgs,
      needsOnboarding: false as const,
    };
  },
);
