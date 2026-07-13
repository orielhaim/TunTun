import { Link, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";
import { useActiveOrganization } from "@/lib/auth-client";
import { useServes, useTunnels } from "@/lib/queries/management";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/app", label: "Overview", exact: true },
  { to: "/app/machines", label: "Machines" },
  { to: "/app/relays", label: "Relays" },
  { to: "/app/tunnels", label: "Tunnels", badge: "tunnels" as const },
  { to: "/app/serves", label: "Serves", badge: "serves" as const },
  { to: "/app/ssh-sessions", label: "SSH" },
  { to: "/app/networks", label: "Networks" },
  { to: "/app/users", label: "Users" },
  { to: "/app/access", label: "Access" },
  { to: "/app/logs", label: "Logs" },
  { to: "/app/settings", label: "Settings" },
] as const;

export function NavTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: tunnels } = useTunnels(orgId);
  const { data: serves } = useServes(orgId);

  const activeTunnelCount = useMemo(
    () => (tunnels ?? []).filter((t) => t.status === "active").length,
    [tunnels],
  );
  const activeServeCount = useMemo(
    () => (serves ?? []).filter((s) => s.status === "active").length,
    [serves],
  );

  return (
    <nav className="flex gap-0.5 overflow-x-auto">
      {navItems.map((item) => {
        const { to, label } = item;
        const exact = "exact" in item && item.exact;
        const active = exact
          ? pathname === "/app" || pathname === "/app/"
          : pathname === to ||
            (to !== "/app/settings" && pathname.startsWith(`${to}/`)) ||
            (to === "/app/settings" && pathname.startsWith("/app/settings"));

        const badge =
          "badge" in item
            ? item.badge === "tunnels"
              ? activeTunnelCount
              : activeServeCount
            : 0;

        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "relative flex items-center gap-1.5 px-3 py-2.5 text-[13px] whitespace-nowrap transition-colors",
              active
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
            {badge > 0 ? (
              <span className="bg-secondary text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                {badge}
              </span>
            ) : null}
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
