import { Outlet } from "@tanstack/react-router";

import { SettingsSubNav } from "@/components/app/nav-tabs";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/settings")({
  component: SettingsLayout,
});

function SettingsLayout() {
  return (
    <div className="space-y-6">
      <SettingsSubNav />
      <Outlet />
    </div>
  );
}
