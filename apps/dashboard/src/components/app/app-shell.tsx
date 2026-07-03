import type { ReactNode } from "react";

import { NavTabs } from "@/components/app/nav-tabs";
import { OrgSwitcher } from "@/components/app/org-switcher";
import { UserMenu } from "@/components/app/user-menu";
import { useSession } from "@/lib/auth-client";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const { data: session } = useSession();
  const email = session?.user.email;

  return (
    <div className="bg-background min-h-screen">
      <header className="border-border/60 border-b">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <OrgSwitcher />
            {email ? (
              <span className="text-muted-foreground hidden truncate text-sm sm:inline">
                {email}
              </span>
            ) : null}
          </div>
          <UserMenu />
        </div>
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <NavTabs />
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
