import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import type { Network } from "@tunnet/api/management";
import { formatDistanceToNow } from "date-fns";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { CreateNetworkDialog } from "@/components/app/create-network-dialog";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { PageToolbar } from "@/components/app/page-toolbar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { isAdminRole, useMemberRole } from "@/hooks/use-member-role";
import { useActiveOrganization } from "@/lib/auth-client";
import { formatNetworkName } from "@/lib/network-utils";
import {
  useMachines,
  useNetworkMutations,
  useNetworks,
} from "@/lib/queries/management";

type NetworkRow = Network & { machineCount: number };

export const Route = createFileRoute("/app/networks/")({
  component: NetworksPage,
});

function NetworksPage() {
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: role } = useMemberRole(orgId);
  const isAdmin = isAdminRole(role);
  const { data: networks, isPending } = useNetworks(orgId);
  const { data: machines } = useMachines(orgId);
  const { remove } = useNetworkMutations(orgId);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const rows = useMemo<NetworkRow[]>(() => {
    const counts = new Map<string, number>();
    for (const machine of machines ?? []) {
      counts.set(machine.networkId, (counts.get(machine.networkId) ?? 0) + 1);
    }
    return (networks ?? []).map((network) => ({
      ...network,
      machineCount: counts.get(network.id) ?? 0,
    }));
  }, [machines, networks]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (n) =>
        n.name.toLowerCase().includes(q) || n.cidr.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const columns = useMemo<ColumnDef<NetworkRow>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            to="/app/networks/$networkId"
            params={{ networkId: row.original.id }}
            className="font-medium hover:underline"
          >
            {formatNetworkName(row.original.name)}
          </Link>
        ),
      },
      {
        id: "cidr",
        header: "CIDR",
        accessorKey: "cidr",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.cidr}</span>
        ),
      },
      {
        id: "mtu",
        header: "MTU",
        accessorKey: "mtu",
      },
      {
        id: "machines",
        header: "Machines",
        accessorKey: "machineCount",
      },
      {
        id: "created",
        header: "Created",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {formatDistanceToNow(new Date(row.original.createdAt), {
              addSuffix: true,
            })}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        meta: { headerClassName: "w-10" },
        cell: ({ row }) =>
          isAdmin ? (
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
                        to="/app/networks/$networkId"
                        params={{ networkId: row.original.id }}
                      />
                    }
                  >
                    View
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setDeleteId(row.original.id)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null,
      },
    ],
    [isAdmin],
  );

  return (
    <>
      <PageHeader
        title="Networks"
        description="Virtual networks that connect your machines."
        actions={
          isAdmin ? (
            <Button onClick={() => setCreateOpen(true)}>
              <PlusIcon className="mr-2 size-4" />
              Create network
            </Button>
          ) : null
        }
      />

      <PageToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name or CIDR..."
        count={filtered.length}
        countLabel={filtered.length === 1 ? "network" : "networks"}
      />

      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No networks yet"
          description="Create a network to start enrolling machines."
          action={
            isAdmin ? (
              <Button onClick={() => setCreateOpen(true)}>
                Create network
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          getRowId={(row) => row.id}
        />
      )}

      {orgId ? (
        <CreateNetworkDialog
          orgId={orgId}
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      ) : null}

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete network"
        description="This will remove the network and all associated machines, policies, and tokens."
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onConfirm={async () => {
          if (!deleteId) return;
          try {
            await remove.mutateAsync(deleteId);
            toast.success("Network deleted");
            setDeleteId(null);
          } catch (err) {
            toast.error(
              err instanceof Error ? err.message : "Failed to delete",
            );
          }
        }}
      />
    </>
  );
}
