import { createFileRoute, redirect } from "@tanstack/react-router";
import { HomePage, hasMarketingLanding } from "@tunnet/cloud-dashboard";

import { getEntitlements, getSession } from "@/lib/auth.functions";

export const Route = createFileRoute("/")({
  loader: async () => {
    const entitlements = await getEntitlements();
    const showLanding = entitlements.cloudLanding && hasMarketingLanding;
    if (!showLanding) {
      const session = await getSession();
      throw redirect({ to: session ? "/app" : "/login" });
    }
    return { showLanding: true as const };
  },
  component: IndexPage,
});

function IndexPage() {
  return <HomePage />;
}
