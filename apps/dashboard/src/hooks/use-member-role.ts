import { useQuery } from "@tanstack/react-query";

import { authClient } from "@/lib/auth-client";
import { queryKeys } from "@/lib/query-keys";

export function useMemberRole(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId ? queryKeys.memberRole(orgId) : ["member-role"],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } =
        await authClient.organization.getActiveMemberRole();
      if (error) throw new Error(error.message);
      return data?.role ?? "member";
    },
  });
}

export function isAdminRole(role: string | undefined) {
  if (!role) return false;
  const roles = role.split(",").map((r) => r.trim());
  return roles.includes("owner") || roles.includes("admin");
}
