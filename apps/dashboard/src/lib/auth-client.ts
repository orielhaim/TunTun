import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { getManagementApiUrl } from "@/lib/env";

export const authClient = createAuthClient({
  baseURL: getManagementApiUrl(),
  fetchOptions: {
    credentials: "include",
  },
  plugins: [organizationClient()],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
  organization,
  useListOrganizations,
  useActiveOrganization,
} = authClient;

export type Session = typeof authClient.$Infer.Session;
