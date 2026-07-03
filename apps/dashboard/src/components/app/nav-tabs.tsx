import { Link, useRouterState } from "@tanstack/react-router";
import {
  KeyRoundIcon,
  LayoutGridIcon,
  MonitorIcon,
  ScrollTextIcon,
  SettingsIcon,
  ShieldIcon,
  UsersIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { to: "/app/machines", label: "Machines", icon: MonitorIcon },
  { to: "/app/networks", label: "Networks", icon: LayoutGridIcon },
  { to: "/app/users", label: "Users", icon: UsersIcon },
  { to: "/app/access", label: "Access", icon: ShieldIcon },
  { to: "/app/logs", label: "Logs", icon: ScrollTextIcon },
  {
    to: "/app/settings",
    label: "Settings",
    icon: SettingsIcon,
    alsoMatch: "/app/settings/",
  },
] as const;

export function NavTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="border-border/60 flex gap-1 overflow-x-auto border-b">
      {navItems.map(({ to, label, icon: Icon }) => {
        const active =
          pathname === to ||
          (to !== "/app/settings" && pathname.startsWith(`${to}/`)) ||
          (to === "/app/settings" && pathname.startsWith("/app/settings"));

        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "text-muted-foreground hover:text-foreground flex items-center gap-2 border-b-2 border-transparent px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
              active && "border-primary text-foreground font-medium",
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SettingsSubNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items = [
    { to: "/app/settings", label: "Organization", exact: true },
    { to: "/app/settings/api-keys", label: "API keys", icon: KeyRoundIcon },
    { to: "/app/settings/account", label: "Account" },
  ] as const;

  return (
    <div className="flex gap-2">
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
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
