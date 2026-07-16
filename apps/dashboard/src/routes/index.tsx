import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasFeature } from "@tunnet/entitlements";

import { HomePage } from "@/components/marketing/home-page";
import { getEntitlements, getSession } from "@/lib/auth.functions";

export const Route = createFileRoute("/")({
  loader: async () => {
    const entitlements = await getEntitlements();
    if (!hasFeature(entitlements, "cloudLanding")) {
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
