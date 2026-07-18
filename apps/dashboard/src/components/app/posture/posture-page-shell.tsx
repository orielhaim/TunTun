import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/app/page-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  {
    value: "definitions",
    label: "Definitions",
    to: "/app/posture" as const,
  },
  {
    value: "compliance",
    label: "Compliance",
    to: "/app/posture/compliance" as const,
  },
  {
    value: "integrations",
    label: "Integrations",
    to: "/app/posture/integrations" as const,
  },
] as const;

type PostureTab = (typeof TABS)[number]["value"];

function tabFromPath(pathname: string): PostureTab {
  if (pathname.includes("/posture/compliance")) return "compliance";
  if (pathname.includes("/posture/integrations")) return "integrations";
  return "definitions";
}

export function PosturePageShell({
  actions,
  children,
}: {
  actions?: ReactNode;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const tab = tabFromPath(pathname);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Posture"
        description="Define device compliance rules, monitor fleet status, and connect external security platforms."
        actions={actions}
        dense
      />

      <Tabs value={tab} className="gap-6">
        <div className="border-b border-border/70">
          <TabsList
            variant="line"
            className="h-auto w-full justify-start gap-0 overflow-x-auto rounded-none bg-transparent p-0"
          >
            {TABS.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="rounded-none px-3"
                render={<Link to={item.to} />}
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {children}
      </Tabs>
    </div>
  );
}
