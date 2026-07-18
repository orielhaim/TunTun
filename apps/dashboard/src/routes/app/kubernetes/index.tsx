import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import type { KubernetesHubNode } from "@tunnet/api/management";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { KubernetesNodeSheet } from "@/components/app/kubernetes-node-sheet";
import { PageHeader } from "@/components/app/page-header";
import { PageToolbar } from "@/components/app/page-toolbar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveOrganization } from "@/lib/auth-client";
import { deviceKindLabel } from "@/lib/device-type";
import { useKubernetes } from "@/lib/queries/management";

export const Route = createFileRoute("/app/kubernetes/")({
  component: KubernetesHubPage,
});

function KubernetesHubPage() {
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data, isPending, isError, error } = useKubernetes(orgId);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [networkFilter, setNetworkFilter] = useState<string>("all");
  const [selected, setSelected] = useState<KubernetesHubNode | null>(null);

  const filtered = useMemo(() => {
    let list = data?.nodes ?? [];
    if (kindFilter !== "all") {
      list = list.filter((n) => String(n.kind) === kindFilter);
    }
    if (networkFilter !== "all") {
      list = list.filter((n) => n.networkId === networkFilter);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.hostname.toLowerCase().includes(q) ||
        n.meshIp.includes(q) ||
        n.networkName.toLowerCase().includes(q) ||
        String(n.kind).toLowerCase().includes(q),
    );
  }, [data?.nodes, search, kindFilter, networkFilter]);

  const kindOptions = useMemo(() => {
    const set = new Set<string>();
    for (const n of data?.nodes ?? []) set.add(String(n.kind));
    return [...set].sort();
  }, [data?.nodes]);

  const columns = useMemo<ColumnDef<KubernetesHubNode>[]>(
    () => [
      {
        id: "name",
        header: "Node",
        cell: ({ row }) => (
          <button
            type="button"
            className="text-left text-[13px] font-medium hover:underline"
            onClick={() => setSelected(row.original)}
          >
            {row.original.name}
          </button>
        ),
      },
      {
        id: "kind",
        header: "Kind",
        cell: ({ row }) => (
          <span className="text-[12px]">
            {deviceKindLabel(String(row.original.kind)) ??
              String(row.original.kind)}
          </span>
        ),
      },
      {
        id: "network",
        header: "Network",
        cell: ({ row }) => (
          <Link
            to="/app/kubernetes/networks/$networkId"
            params={{ networkId: row.original.networkId }}
            className="text-[13px] hover:underline"
          >
            {row.original.networkName}
          </Link>
        ),
      },
      {
        id: "ip",
        header: "Mesh IP",
        cell: ({ row }) => (
          <span className="font-mono text-[11px]">{row.original.meshIp}</span>
        ),
      },
      {
        id: "status",
        header: "Presence",
        cell: ({ row }) => (
          <span
            className={
              row.original.online
                ? "text-[12px] text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground text-[12px]"
            }
          >
            {row.original.online ? "Online" : "Offline"}
          </span>
        ),
      },
      {
        id: "routes",
        header: "Routes",
        cell: ({ row }) => (
          <span className="tabular-nums text-[12px]">
            {row.original.subnetRouteCount}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        meta: { headerClassName: "w-[72px]", className: "w-[72px]" },
        cell: ({ row }) => (
          <Link
            to="/app/machines/$endpointId"
            params={{ endpointId: row.original.endpointId }}
            className="text-muted-foreground hover:text-foreground text-[11px]"
          >
            Machine
          </Link>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        dense
        title="Kubernetes"
        description="Operator-managed connectors and proxies on your mesh."
      />

      {data && data.byNetwork.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.byNetwork.map((net) => (
            <Link
              key={net.networkId}
              to="/app/kubernetes/networks/$networkId"
              params={{ networkId: net.networkId }}
              className="panel hover:border-border block space-y-1 p-4 transition-colors"
            >
              <div className="text-[13px] font-medium">{net.networkName}</div>
              <p className="text-muted-foreground text-[12px]">
                {net.onlineCount} online · {net.nodeCount} nodes
              </p>
            </Link>
          ))}
        </div>
      ) : null}

      <PageToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search node, kind, network, IP…"
        count={filtered.length}
        countLabel={filtered.length === 1 ? "node" : "nodes"}
        filters={
          <>
            <Select
              value={kindFilter}
              onValueChange={(v) => v && setKindFilter(v)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Kind" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                {kindOptions.map((k) => (
                  <SelectItem key={k} value={k}>
                    {deviceKindLabel(k) ?? k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={networkFilter}
              onValueChange={(v) => v && setNetworkFilter(v)}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Network" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All networks</SelectItem>
                {(data?.byNetwork ?? []).map((n) => (
                  <SelectItem key={n.networkId} value={n.networkId}>
                    {n.networkName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : isError ? (
        <EmptyState
          title="Couldn’t load Kubernetes nodes"
          description={
            error instanceof Error
              ? error.message
              : "The Kubernetes hub request failed. Try again."
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No Kubernetes nodes"
          description="Deploy the Tunnet operator and create a TunnetConnector (or other CRD) to enroll k8s nodes into a network."
        />
      ) : (
        <DataTable columns={columns} data={filtered} />
      )}

      <KubernetesNodeSheet
        node={selected}
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </div>
  );
}
