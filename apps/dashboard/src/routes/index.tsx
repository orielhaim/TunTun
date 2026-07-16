import { createFileRoute, redirect } from "@tanstack/react-router";

import { HomePage } from "@/components/marketing/home-page";
import { getEntitlements, getSession } from "@/lib/auth.functions";

export const Route = createFileRoute("/")({
  loader: async () => {
    const entitlements = await getEntitlements();
    if (!entitlements.cloudLanding) {
      const session = await getSession();
      throw redirect({ to: session ? "/app" : "/login" });
    }
    return null;
  },
  component: HomePage,
});
