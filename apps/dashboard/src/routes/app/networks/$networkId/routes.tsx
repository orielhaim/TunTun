import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import type {
  CreateHostnameRouteBody,
  CreateSubnetRouteBody,
  Device,
  HostnameRoute,
  SubnetRoute,
} from "@tuntun/api/management";
import { PlusIcon, SearchIcon, TrashIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { DataTable } from "@/components/app/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { isAdminRole, useMemberRole } from "@/hooks/use-member-role";
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

type UnifiedRoute = {
  id: string;
  kind: "subnet" | "hostname";
  name: string;
  destination: string;
  via: string;
  description: string;
  enabled: boolean;
};

function NetworkRoutesPage() {
  const { networkId } = Route.useParams();
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: role } = useMemberRole(orgId);
  const isAdmin = isAdminRole(role);
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

  const rows = useMemo<UnifiedRoute[]>(() => {
    const subnets: UnifiedRoute[] = (subnetRoutes ?? []).map((r) => ({
      id: r.id,
      kind: "subnet" as const,
      name: r.cidr,
      destination: r.cidr,
      via: r.viaIp || r.endpointId.slice(0, 8),
      description: r.description ?? "",
      enabled: r.enabled,
    }));
    const hosts: UnifiedRoute[] = (hostnameRoutes ?? []).map((r) => ({
      id: r.id,
      kind: "hostname" as const,
      name: r.hostnameLabel ?? r.hostname,
      destination: r.targetIp || "local resolve",
      via: r.viaIp || r.endpointId.slice(0, 8),
      description: r.description ?? "",
      enabled: r.enabled,
    }));
    return [...subnets, ...hosts];
  }, [subnetRoutes, hostnameRoutes]);

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

  const columns = useMemo<ColumnDef<UnifiedRoute>[]>(
    () => [
      {
        id: "type",
        header: "Type",
        meta: { headerClassName: "w-28" },
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize">
            {row.original.kind}
          </Badge>
        ),
      },
      {
        id: "name",
        header: "Route",
        cell: ({ row }) => (
          <span className="font-mono text-sm">{row.original.name}</span>
        ),
      },
      {
        id: "destination",
        header: "Destination",
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono text-sm">
            {row.original.destination}
          </span>
        ),
      },
      {
        id: "via",
        header: "Via",
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono text-xs">
            {row.original.via}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        meta: { headerClassName: "w-28" },
        cell: ({ row }) => (
          <Badge variant={row.original.enabled ? "default" : "outline"}>
            {row.original.enabled ? "Enabled" : "Disabled"}
          </Badge>
        ),
      },
      ...(isAdmin
        ? [
            {
              id: "actions",
              header: "",
              meta: { headerClassName: "w-32" },
              cell: ({ row }: { row: { original: UnifiedRoute } }) => {
                const r = row.original;
                return (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const run =
                          r.kind === "subnet" ? toggleSubnet : toggleHostname;
                        void run
                          .mutateAsync({
                            routeId: r.id,
                            enabled: !r.enabled,
                          })
                          .then(() => toast.success("Updated"))
                          .catch((err: unknown) =>
                            toast.error(
                              err instanceof Error
                                ? err.message
                                : "Failed to update",
                            ),
                          );
                      }}
                    >
                      {r.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        r.kind === "subnet"
                          ? setDeleteSubnetId(r.id)
                          : setDeleteHostnameId(r.id)
                      }
                    >
                      <TrashIcon className="size-4" />
                    </Button>
                  </div>
                );
              },
            } satisfies ColumnDef<UnifiedRoute>,
          ]
        : []),
    ],
    [isAdmin, toggleHostname, toggleSubnet],
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
        {isAdmin ? (
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

      <RoutesMiniDiagram
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

function RoutesMiniDiagram({
  subnets,
  hostnames,
}: {
  subnets: SubnetRoute[];
  hostnames: HostnameRoute[];
}) {
  const items = [
    ...subnets.slice(0, 6).map((r) => ({
      id: r.id,
      label: r.cidr,
      tone: "subnet" as const,
    })),
    ...hostnames.slice(0, 6).map((r) => ({
      id: r.id,
      label: r.hostnameLabel ?? r.hostname,
      tone: "hostname" as const,
    })),
  ].slice(0, 8);

  return (
    <div className="relative overflow-hidden rounded-lg border border-border/60 bg-[#0b0d10]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.25) 1px, transparent 0)",
          backgroundSize: "16px 16px",
        }}
      />
      <div className="relative flex min-h-[140px] items-center justify-center gap-10 px-8 py-8">
        <div className="flex flex-col items-center gap-2">
          <div className="flex size-11 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/10 text-[10px] font-medium tracking-wide text-emerald-300 uppercase">
            Mesh
          </div>
        </div>
        <div className="relative flex min-w-[40%] flex-1 flex-col items-stretch gap-2">
          {items.length === 0 ? (
            <div className="text-muted-foreground text-center text-xs">
              No advertised routes
            </div>
          ) : (
            items.map((item, i) => (
              <div
                key={item.id}
                className="relative flex items-center gap-3"
                style={{ marginLeft: `${(i % 3) * 12}px` }}
              >
                <div
                  className={cn(
                    "h-px flex-1",
                    item.tone === "subnet"
                      ? "bg-gradient-to-r from-emerald-400/70 to-emerald-400/10"
                      : "bg-gradient-to-r from-sky-400/70 to-sky-400/10",
                  )}
                />
                <span
                  className={cn(
                    "rounded border px-2 py-1 font-mono text-[11px]",
                    item.tone === "subnet"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                      : "border-sky-500/30 bg-sky-500/10 text-sky-200",
                  )}
                >
                  {item.label}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function CreateSubnetRouteDialog({
  open,
  onOpenChange,
  devices,
  loading,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devices: Device[];
  loading: boolean;
  onSubmit: (body: CreateSubnetRouteBody) => Promise<void>;
}) {
  const [endpointId, setEndpointId] = useState("");
  const [cidr, setCidr] = useState("");
  const [description, setDescription] = useState("");
  const agentDevices = devices.filter((d) => d.type === "agent");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit({
              endpointId,
              cidr,
              description: description.trim() || undefined,
              enabled: true,
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Add subnet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <GatewaySelect
              devices={agentDevices}
              value={endpointId}
              onChange={setEndpointId}
            />
            <div className="space-y-2">
              <Label htmlFor="cidr">CIDR</Label>
              <Input
                id="cidr"
                className="font-mono"
                placeholder="10.0.0.0/24"
                value={cidr}
                onChange={(e) => setCidr(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subnet-desc">Description</Label>
              <Input
                id="subnet-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !endpointId || !cidr}>
              {loading ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateHostnameRouteDialog({
  open,
  onOpenChange,
  devices,
  loading,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devices: Device[];
  loading: boolean;
  onSubmit: (body: CreateHostnameRouteBody) => Promise<void>;
}) {
  const [endpointId, setEndpointId] = useState("");
  const [hostname, setHostname] = useState("");
  const [targetIp, setTargetIp] = useState("");
  const [description, setDescription] = useState("");
  const agentDevices = devices.filter((d) => d.type === "agent");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit({
              endpointId,
              hostname,
              targetIp: targetIp.trim() || undefined,
              description: description.trim() || undefined,
              enabled: true,
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Add hostname</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <GatewaySelect
              devices={agentDevices}
              value={endpointId}
              onChange={setEndpointId}
            />
            <div className="space-y-2">
              <Label htmlFor="hostname">Hostname</Label>
              <Input
                id="hostname"
                className="font-mono"
                placeholder="wiki.internal or *.staging"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-ip">Target IP</Label>
              <Input
                id="target-ip"
                className="font-mono"
                placeholder="Optional"
                value={targetIp}
                onChange={(e) => setTargetIp(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="host-desc">Description</Label>
              <Input
                id="host-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !endpointId || !hostname}
            >
              {loading ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GatewaySelect({
  devices,
  value,
  onChange,
}: {
  devices: Device[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Gateway</Label>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger>
          <SelectValue placeholder="Select machine" />
        </SelectTrigger>
        <SelectContent>
          {devices.map((device) => (
            <SelectItem key={device.endpointId} value={device.endpointId}>
              {device.hostname} ({device.assignedIp})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
