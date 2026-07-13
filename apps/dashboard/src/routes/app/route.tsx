import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router";

import { AppShell } from "@/components/app/app-shell";
import { bootstrapAppSession } from "@/lib/auth.functions";

export const Route = createFileRoute("/app")({
  beforeLoad: async ({ location }) => {
    const result = await bootstrapAppSession();

    if (!result.authenticated) {
      const redirectTo = `${location.pathname}${location.searchStr}`;
      throw redirect({
        to: "/login",
        search: { redirect: redirectTo },
      });
    }

    if (result.needsOnboarding && location.pathname !== "/app/onboarding") {
      throw redirect({ to: "/app/onboarding" });
    }

    if (!result.needsOnboarding && location.pathname === "/app/onboarding") {
      throw redirect({ to: "/app" });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isOnboarding = pathname === "/app/onboarding";

  if (isOnboarding) {
    return <Outlet />;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
