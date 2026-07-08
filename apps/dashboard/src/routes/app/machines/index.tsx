import { Link } from "@tanstack/react-router";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { MoreHorizontalIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AddMachinePanel } from "@/components/app/add-machine-panel";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { EnrollmentTokenDialog } from "@/components/app/enrollment-token-dialog";
import { LastSeenCell } from "@/components/app/last-seen-cell";
import { MachineAddressPopover } from "@/components/app/machine-address-popover";
import { PageHeader } from "@/components/app/page-header";
import { PageToolbar } from "@/components/app/page-toolbar";
import { StatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  seedPresenceCache,
  usePresenceStream,
} from "@/hooks/use-presence-stream";
import { isAdminRole, useMemberRole } from "@/hooks/use-member-role";
import { useActiveOrganization } from "@/lib/auth-client";
import type { AggregatedMachine } from "@/lib/machine-utils";
import { formatNetworkName } from "@/lib/network-utils";
import { useDeviceMutations, useMachines } from "@/lib/queries/management";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/machines/")({
  component: MachinesPage,
});

function MachinesPage() {
  const queryClient = useQueryClient();
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: role } = useMemberRole(orgId);
  const isAdmin = isAdminRole(role);
  const { data: machines, isPending } = useMachines(orgId);
  const deviceMutations = useDeviceMutations(orgId);
  usePresenceStream(orgId);

  useEffect(() => {
    if (orgId && machines) {
      seedPresenceCache(queryClient, orgId, machines);
    }
  }, [orgId, machines, queryClient]);
  const [search, setSearch] = useState("");
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<{
    networkId: string;
    endpointId: string;
    hostname: string;
  } | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [confirmBulkRemove, setConfirmBulkRemove] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !machines) return machines ?? [];
    return machines.filter(
      (m) =>
        m.hostname.toLowerCase().includes(q) ||
        m.networkName.toLowerCase().includes(q) ||
        m.assignedIp.includes(q) ||
        (m.tenantIpv6?.includes(q) ?? false) ||
        (m.os?.toLowerCase().includes(q) ?? false),
    );
  }, [machines, search]);

  const selectedMachines = useMemo(() => {
    if (!filtered.length) return [];
    const selectedIds = new Set(
      Object.entries(rowSelection)
        .filter(([, selected]) => selected)
        .map(([id]) => id),
    );
    return filtered.filter((machine) =>
      selectedIds.has(`${machine.networkId}-${machine.endpointId}`),
    );
  }, [filtered, rowSelection]);

  const columns = useMemo<ColumnDef<AggregatedMachine>[]>(
    () => [
      {
        id: "machine",
        header: "Machine",
        cell: ({ row }) => {
          const machine = row.original;
          return (
            <Link
              to="/app/machines/$endpointId"
              params={{ endpointId: machine.endpointId }}
              className="font-medium hover:underline"
            >
              {machine.hostname}
            </Link>
          );
        },
      },
      {
        id: "network",
        header: "Network",
        cell: ({ row }) => (
          <Badge variant="secondary">
            {formatNetworkName(row.original.networkName)}
          </Badge>
        ),
      },
      {
        id: "address",
        header: "Address",
        cell: ({ row }) =>
          orgId ? (
            <MachineAddressPopover
              orgId={orgId}
              endpointId={row.original.endpointId}
              assignedIp={row.original.assignedIp}
              ipv6Enabled={row.original.ipv6Enabled}
              tenantIpv6={row.original.tenantIpv6}
            />
          ) : (
            <span className="font-mono text-xs">{row.original.assignedIp}</span>
          ),
      },
      {
        id: "version",
        header: "Version",
        cell: ({ row }) => (
          <>
            <div className="text-sm">{row.original.agentVersion ?? "—"}</div>
            <div className="text-muted-foreground text-xs">
              {row.original.os ?? "Unknown OS"}
            </div>
          </>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge orgId={orgId} device={row.original} />,
      },
      {
        id: "lastSeen",
        header: "Last seen",
        cell: ({ row }) => <LastSeenCell orgId={orgId} device={row.original} />,
      },
      {
        id: "actions",
        header: "",
        meta: { headerClassName: "w-10" },
        cell: ({ row }) => {
          const machine = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon" className="size-8" />
                }
              >
                <MoreHorizontalIcon className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    render={
                      <Link
                        to="/app/machines/$endpointId"
                        params={{ endpointId: machine.endpointId }}
                      />
                    }
                  >
                    View details
                  </DropdownMenuItem>
                  {isAdmin ? (
                    <>
                      <DropdownMenuItem
                        onClick={() =>
                          void deviceMutations.updateMembership
                            .mutateAsync({
                              networkId: machine.networkId,
                              endpointId: machine.endpointId,
                              status:
                                machine.status === "active"
                                  ? "suspended"
                                  : "active",
                            })
                            .then(() =>
                              toast.success(
                                machine.status === "active"
                                  ? "Machine suspended"
                                  : "Machine activated",
                              ),
                            )
                            .catch((err: Error) => toast.error(err.message))
                        }
                      >
                        {machine.status === "active" ? "Suspend" : "Activate"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() =>
                          setConfirmRemove({
                            networkId: machine.networkId,
                            endpointId: machine.endpointId,
                            hostname: machine.hostname,
                          })
                        }
                      >
                        Remove
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [deviceMutations.updateMembership, isAdmin, orgId],
  );

  return (
    <>
      <PageHeader
        title="Machines"
        description="Manage the agents connected to your organization."
        actions={
          isAdmin ? (
            <Button onClick={() => setEnrollOpen(true)}>
              <PlusIcon className="mr-2 size-4" />
              Add machine
            </Button>
          ) : null
        }
      />

      <PageToolbar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setRowSelection({});
        }}
        searchPlaceholder="Search by name, network, IP, OS..."
        count={filtered.length}
        countLabel={filtered.length === 1 ? "machine" : "machines"}
        actions={
          isAdmin && selectedMachines.length > 0 ? (
            <Button
              variant="destructive"
              onClick={() => setConfirmBulkRemove(true)}
            >
              <Trash2Icon className="mr-2 size-4" />
              Remove {selectedMachines.length}{" "}
              {selectedMachines.length === 1 ? "machine" : "machines"}
            </Button>
          ) : null
        }
      />

      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No machines yet"
          description="Create an enrollment token and install the TunTun agent on a device."
          action={
            isAdmin ? (
              <Button onClick={() => setEnrollOpen(true)}>Add machine</Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          getRowId={(row) => `${row.networkId}-${row.endpointId}`}
          selectable={isAdmin}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
        />
      )}

      {(machines?.length ?? 0) < 3 ? (
        <AddMachinePanel className="mt-8" />
      ) : null}

      {orgId ? (
        <EnrollmentTokenDialog
          orgId={orgId}
          open={enrollOpen}
          onOpenChange={setEnrollOpen}
        />
      ) : null}

      <ConfirmDialog
        open={confirmRemove !== null}
        onOpenChange={(open) => !open && setConfirmRemove(null)}
        title="Remove machine"
        description={`Remove ${confirmRemove?.hostname ?? "this machine"} from the network? This cannot be undone.`}
        confirmLabel="Remove"
        destructive
        loading={deviceMutations.remove.isPending}
        onConfirm={async () => {
          if (!confirmRemove) return;
          try {
            await deviceMutations.remove.mutateAsync(confirmRemove);
            toast.success("Machine removed");
            setConfirmRemove(null);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Failed to remove",
            );
          }
        }}
      />

      <ConfirmDialog
        open={confirmBulkRemove}
        onOpenChange={setConfirmBulkRemove}
        title="Remove machines"
        description={`Remove ${selectedMachines.length} ${
          selectedMachines.length === 1 ? "machine" : "machines"
        } from their networks? This cannot be undone.`}
        confirmLabel="Remove"
        destructive
        loading={deviceMutations.removeMany.isPending}
        onConfirm={async () => {
          if (selectedMachines.length === 0) return;
          try {
            await deviceMutations.removeMany.mutateAsync(
              selectedMachines.map((machine) => ({
                networkId: machine.networkId,
                endpointId: machine.endpointId,
              })),
            );
            toast.success(
              selectedMachines.length === 1
                ? "Machine removed"
                : `${selectedMachines.length} machines removed`,
            );
            setRowSelection({});
            setConfirmBulkRemove(false);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Failed to remove machines",
            );
          }
        }}
      />
    </>
  );
}
