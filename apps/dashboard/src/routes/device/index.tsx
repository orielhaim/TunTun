import { createFileRoute, redirect } from "@tanstack/react-router";

import { getSession } from "@/lib/auth.functions";

export const Route = createFileRoute("/device/")({
  validateSearch: (search: Record<string, unknown>) => ({
    user_code:
      typeof search.user_code === "string" ? search.user_code : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const session = await getSession();
    const accountPath = search.user_code
      ? `/app/settings/account?user_code=${encodeURIComponent(search.user_code)}`
      : "/app/settings/account";

    if (!session) {
      throw redirect({
        to: "/login",
        search: { redirect: accountPath },
      });
    }

    throw redirect({
      to: "/app/settings/account",
      search: search.user_code ? { user_code: search.user_code } : {},
    });
  },
});
