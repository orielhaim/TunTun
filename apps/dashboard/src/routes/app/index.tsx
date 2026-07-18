import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import { useMemo } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-permission";
import { useActiveOrganization } from "@/lib/auth-client";
import { getMachinePresence } from "@/lib/machine-utils";
import { formatNetworkName } from "@/lib/network-utils";
import {
  useMachines,
  useNetworks,
  useRelays,
  useServes,
  useTunnels,
} from "@/lib/queries/management";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/")({
  component: OverviewPage,
});

function OverviewPage() {
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: canCreateNetwork = false } = useCan(orgId, "network", "create");
  const { data: machines, isPending: machinesPending } = useMachines(orgId);
  const { data: relays, isPending: relaysPending } = useRelays(orgId);
  const { data: tunnels, isPending: tunnelsPending } = useTunnels(orgId);
  const { data: serves, isPending: servesPending } = useServes(orgId);
  const { data: networks, isPending: networksPending } = useNetworks(orgId);

  const now = Date.now();

  const onlineMachines = useMemo(
    () =>
      (machines ?? []).filter((m) => getMachinePresence(m, now) === "online")
        .length,
    [machines, now],
  );
  const totalMachines = machines?.length ?? 0;
  const healthyRelays = useMemo(
    () => (relays ?? []).filter((r) => r.status === "healthy").length,
    [relays],
  );
  const activeTunnels = useMemo(
    () => (tunnels ?? []).filter((t) => t.status === "active").length,
    [tunnels],
  );
  const activeServes = useMemo(
    () => (serves ?? []).filter((s) => s.status === "active").length,
    [serves],
  );

  const networkRows = useMemo(() => {
    const counts = new Map<string, { total: number; online: number }>();
    for (const machine of machines ?? []) {
      const entry = counts.get(machine.networkId) ?? { total: 0, online: 0 };
      entry.total += 1;
      if (getMachinePresence(machine, now) === "online") entry.online += 1;
      counts.set(machine.networkId, entry);
    }
    return (networks ?? []).map((network) => ({
      ...network,
      ...(counts.get(network.id) ?? { total: 0, online: 0 }),
    }));
  }, [machines, networks, now]);

  const pending =
    machinesPending ||
    relaysPending ||
    tunnelsPending ||
    servesPending ||
    networksPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        dense
        description="Start in a network Mesh - topology, machines, and routes in one place."
      />

      {pending ? (
        <Skeleton className="h-48 w-full" />
      ) : networkRows.length === 0 ? (
        <EmptyState
          title="No networks yet"
          description="Create a network to enroll machines and open the Mesh."
          action={
            canCreateNetwork ? (
              <Button nativeButton={false} render={<Link to="/app/networks" />}>
                <PlusIcon className="mr-2 size-4" />
                Go to Networks
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="text-[13px] font-medium tracking-tight">
                  Networks
                </h2>
                <p className="text-muted-foreground text-[11px]">
                  Open Mesh for live topology
                </p>
              </div>
              <Button
                nativeButton={false}
                size="sm"
                variant="outline"
                render={<Link to="/app/networks" />}
              >
                All networks
              </Button>
            </div>
            <div className="space-y-2">
              {networkRows.map((network) => (
                <Link
                  key={network.id}
                  to="/app/networks/$networkId"
                  params={{ networkId: network.id }}
                  className="panel hover:border-border group flex items-center gap-4 p-3.5 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium tracking-tight">
                      {formatNetworkName(network.name)}
                    </div>
                    <p className="text-muted-foreground mt-0.5 font-mono text-[11px]">
                      {network.cidr}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] font-semibold tabular-nums tracking-tight">
                      {network.online}
                      <span className="text-muted-foreground font-normal">
                        /{network.total}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-[11px]">online</p>
                  </div>
                  <ChevronRightIcon className="text-muted-foreground size-4 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </section>

          <aside className="space-y-3">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              <StatTile
                label="Machines online"
                value={`${onlineMachines}/${totalMachines}`}
                to="/app/machines"
              />
              <StatTile
                label="Healthy relays"
                value={String(healthyRelays)}
                to="/app/relays"
              />
              <StatTile
                label="Active tunnels"
                value={String(activeTunnels)}
                to="/app/tunnels"
              />
              <StatTile
                label="Active serves"
                value={String(activeServes)}
                to="/app/serves"
              />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  to,
}: {
  label: string;
  value: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "panel hover:border-border block px-3 py-2.5 transition-colors",
      )}
    >
      <div className="text-muted-foreground text-[11px]">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums tracking-tight">
        {value}
      </div>
    </Link>
  );
}
