import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type {
  CreateHostnameRouteBody,
  CreateSubnetRouteBody,
} from "@tunnet/api/management";
import { PlusIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { DataTable } from "@/components/app/data-table";
import {
  buildNetworkRouteColumns,
  CreateHostnameRouteDialog,
  CreateSubnetRouteDialog,
  NetworkRoutesMiniDiagram,
  toUnifiedRoutes,
  type UnifiedRoute,
} from "@/components/app/route-management";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-permission";
import { useActiveOrganization } from "@/lib/auth-client";
import { createManagementClient } from "@/lib/management-client";
import {
  useDevices,
  useHostnameRoutes,
  useSubnetRoutes,
} from "@/lib/queries/management";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/networks/$networkId/routes")({
  component: NetworkRoutesPage,
});

type RouteKind = "all" | "subnet" | "hostname";

function NetworkRoutesPage() {
  const { networkId } = Route.useParams();
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: canManage = false } = useCan(orgId, "route", "update");
  const { data: subnetRoutes, isPending: subnetsPending } = useSubnetRoutes(
    orgId,
    networkId,
  );
  const { data: hostnameRoutes, isPending: hostnamesPending } =
    useHostnameRoutes(orgId, networkId);
  const { data: devices } = useDevices(orgId, networkId);
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<RouteKind>("all");
  const [query, setQuery] = useState("");
  const [createSubnetOpen, setCreateSubnetOpen] = useState(false);
  const [createHostnameOpen, setCreateHostnameOpen] = useState(false);
  const [deleteSubnetId, setDeleteSubnetId] = useState<string | null>(null);
  const [deleteHostnameId, setDeleteHostnameId] = useState<string | null>(null);

  const invalidateRoutes = () => {
    if (!orgId) return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.subnetRoutes(orgId, networkId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.hostnameRoutes(orgId, networkId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.topology(orgId, networkId),
    });
  };

  const createSubnet = useMutation({
    mutationFn: async (body: CreateSubnetRouteBody) => {
      if (!orgId) throw new Error("No organization");
      return createManagementClient(orgId).createSubnetRoute(networkId, body);
    },
    onSuccess: invalidateRoutes,
  });
  const toggleSubnet = useMutation({
    mutationFn: async ({
      routeId,
      enabled,
    }: {
      routeId: string;
      enabled: boolean;
    }) => {
      if (!orgId) throw new Error("No organization");
      return createManagementClient(orgId).updateSubnetRoute(
        networkId,
        routeId,
        {
          enabled,
        },
      );
    },
    onSuccess: invalidateRoutes,
  });
  const deleteSubnet = useMutation({
    mutationFn: async (routeId: string) => {
      if (!orgId) throw new Error("No organization");
      return createManagementClient(orgId).deleteSubnetRoute(
        networkId,
        routeId,
      );
    },
    onSuccess: invalidateRoutes,
  });

  const createHostname = useMutation({
    mutationFn: async (body: CreateHostnameRouteBody) => {
      if (!orgId) throw new Error("No organization");
      return createManagementClient(orgId).createHostnameRoute(networkId, body);
    },
    onSuccess: invalidateRoutes,
  });
  const toggleHostname = useMutation({
    mutationFn: async ({
      routeId,
      enabled,
    }: {
      routeId: string;
      enabled: boolean;
    }) => {
      if (!orgId) throw new Error("No organization");
      return createManagementClient(orgId).updateHostnameRoute(
        networkId,
        routeId,
        { enabled },
      );
    },
    onSuccess: invalidateRoutes,
  });
  const deleteHostname = useMutation({
    mutationFn: async (routeId: string) => {
      if (!orgId) throw new Error("No organization");
      return createManagementClient(orgId).deleteHostnameRoute(
        networkId,
        routeId,
      );
    },
    onSuccess: invalidateRoutes,
  });

  const rows = useMemo(
    () => toUnifiedRoutes(subnetRoutes ?? [], hostnameRoutes ?? []),
    [subnetRoutes, hostnameRoutes],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind !== "all" && r.kind !== kind) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.destination.toLowerCase().includes(q) ||
        r.via.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
      );
    });
  }, [rows, kind, query]);

  const columns = useMemo(
    () =>
      buildNetworkRouteColumns({
        canManage,
        onToggle: (r: UnifiedRoute) => {
          const run = r.kind === "subnet" ? toggleSubnet : toggleHostname;
          void run
            .mutateAsync({
              routeId: r.id,
              enabled: !r.enabled,
            })
            .then(() => toast.success("Updated"))
            .catch((err: unknown) =>
              toast.error(
                err instanceof Error ? err.message : "Failed to update",
              ),
            );
        },
        onDelete: (r: UnifiedRoute) => {
          if (r.kind === "subnet") setDeleteSubnetId(r.id);
          else setDeleteHostnameId(r.id);
        },
      }),
    [canManage, toggleHostname, toggleSubnet],
  );

  const pending = subnetsPending || hostnamesPending;
  const subnetCount = subnetRoutes?.length ?? 0;
  const hostnameCount = hostnameRoutes?.length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium tracking-tight">Routes</h2>
          <p className="text-muted-foreground text-xs tabular-nums">
            {subnetCount} subnet · {hostnameCount} hostname
          </p>
        </div>
        {canManage ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreateHostnameOpen(true)}
            >
              <PlusIcon className="size-3.5" />
              Hostname
            </Button>
            <Button size="sm" onClick={() => setCreateSubnetOpen(true)}>
              <PlusIcon className="size-3.5" />
              Subnet
            </Button>
          </div>
        ) : null}
      </div>

      <NetworkRoutesMiniDiagram
        subnets={subnetRoutes ?? []}
        hostnames={hostnameRoutes ?? []}
      />

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["all", "All", rows.length],
            ["subnet", "Subnet", subnetCount],
            ["hostname", "Hostname", hostnameCount],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            onClick={() => setKind(id)}
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs transition-colors",
              kind === id
                ? "border-border bg-secondary text-foreground"
                : "border-transparent bg-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            {label}
            <span className="text-muted-foreground tabular-nums">{count}</span>
          </button>
        ))}
        <div className="relative ml-auto w-full max-w-xs sm:w-56">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search routes"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      {pending ? (
        <Skeleton className="h-48 w-full" />
      ) : filtered.length === 0 ? (
        <div className="text-muted-foreground flex h-32 items-center justify-center rounded-lg border border-dashed border-border/70 text-sm">
          No routes
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          getRowId={(row) => `${row.kind}:${row.id}`}
        />
      )}

      <CreateSubnetRouteDialog
        open={createSubnetOpen}
        onOpenChange={setCreateSubnetOpen}
        devices={devices ?? []}
        loading={createSubnet.isPending}
        onSubmit={async (body) => {
          try {
            await createSubnet.mutateAsync(body);
            toast.success("Created");
            setCreateSubnetOpen(false);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Failed to create",
            );
          }
        }}
      />

      <CreateHostnameRouteDialog
        open={createHostnameOpen}
        onOpenChange={setCreateHostnameOpen}
        devices={devices ?? []}
        loading={createHostname.isPending}
        onSubmit={async (body) => {
          try {
            await createHostname.mutateAsync(body);
            toast.success("Created");
            setCreateHostnameOpen(false);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Failed to create",
            );
          }
        }}
      />

      <ConfirmDialog
        open={deleteSubnetId !== null}
        onOpenChange={(open) => !open && setDeleteSubnetId(null)}
        title="Delete subnet route"
        description="This CIDR will stop advertising through the gateway."
        confirmLabel="Delete"
        destructive
        loading={deleteSubnet.isPending}
        onConfirm={async () => {
          if (!deleteSubnetId) return;
          try {
            await deleteSubnet.mutateAsync(deleteSubnetId);
            toast.success("Deleted");
            setDeleteSubnetId(null);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Failed to delete",
            );
          }
        }}
      />

      <ConfirmDialog
        open={deleteHostnameId !== null}
        onOpenChange={(open) => !open && setDeleteHostnameId(null)}
        title="Delete hostname route"
        description="This hostname will stop resolving through the gateway."
        confirmLabel="Delete"
        destructive
        loading={deleteHostname.isPending}
        onConfirm={async () => {
          if (!deleteHostnameId) return;
          try {
            await deleteHostname.mutateAsync(deleteHostnameId);
            toast.success("Deleted");
            setDeleteHostnameId(null);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Failed to delete",
            );
          }
        }}
      />
    </div>
  );
}
