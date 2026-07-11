import { Link, useRouterState } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

const navItems = [
  { to: "/app/machines", label: "Machines" },
  { to: "/app/networks", label: "Networks" },
  { to: "/app/users", label: "Users" },
  { to: "/app/access", label: "Access" },
  { to: "/app/logs", label: "Logs" },
  { to: "/app/settings", label: "Settings" },
] as const;

export function NavTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex gap-0.5 overflow-x-auto">
      {navItems.map(({ to, label }) => {
        const active =
          pathname === to ||
          (to !== "/app/settings" && pathname.startsWith(`${to}/`)) ||
          (to === "/app/settings" && pathname.startsWith("/app/settings"));

        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "relative px-3 py-2.5 text-[13px] whitespace-nowrap transition-colors",
              active
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {active ? (
              <span className="bg-foreground absolute inset-x-3 bottom-0 h-0.5 rounded-full" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function SettingsSubNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items = [
    { to: "/app/settings", label: "Organization" },
    { to: "/app/settings/api-keys", label: "API keys" },
    { to: "/app/settings/account", label: "Account" },
  ] as const;

  return (
    <div className="flex gap-1">
      {items.map(({ to, label }) => {
        const active =
          to === "/app/settings"
            ? pathname === "/app/settings"
            : pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "rounded-md px-3 py-1.5 text-[13px] transition-colors",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
