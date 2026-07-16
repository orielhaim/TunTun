import { useQuery } from "@tanstack/react-query";

import { authClient } from "@/lib/auth-client";
import { queryKeys } from "@/lib/query-keys";

export type PermissionCheck = Record<string, string[]>;

export function useHasPermission(
  orgId: string | undefined,
  permissions: PermissionCheck,
) {
  const key = JSON.stringify(permissions);
  return useQuery({
    queryKey: orgId
      ? [...queryKeys.memberRole(orgId), "permission", key]
      : ["permission", key],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await authClient.organization.hasPermission({
        organizationId: orgId,
        permissions,
      });
      if (error) throw new Error(error.message);
      return Boolean(data?.success);
    },
  });
}

/** Convenience: true when the member can perform the given action on a resource. */
export function useCan(
  orgId: string | undefined,
  resource: string,
  action: string,
) {
  return useHasPermission(orgId, { [resource]: [action] });
}
