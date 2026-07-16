import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { CreateServeDialog } from "@/components/app/create-serve-dialog";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { EntityStatus } from "@/components/app/entity-status";
import { PageHeader } from "@/components/app/page-header";
import { PageToolbar } from "@/components/app/page-toolbar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-permission";
import { useActiveOrganization } from "@/lib/auth-client";
import { useServes } from "@/lib/queries/management";

export const Route = createFileRoute("/app/serves/")({
  component: ServesPage,
});

type ServeRow = NonNullable<ReturnType<typeof useServes>["data"]>[number];

function ServesPage() {
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: canCreate = false } = useCan(orgId, "serve", "create");
  const { data: serves, isPending } = useServes(orgId);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = serves ?? [];
    if (statusFilter !== "all") {
      list = list.filter((s) => s.status === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.internalHostname.toLowerCase().includes(q) ||
        (s.hostname?.toLowerCase().includes(q) ?? false) ||
        (s.networkName?.toLowerCase().includes(q) ?? false) ||
        s.protocol.toLowerCase().includes(q),
    );
  }, [serves, search, statusFilter]);

  const columns = useMemo<ColumnDef<ServeRow>[]>(
    () => [
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <EntityStatus status={row.original.status} />,
      },
      {
        id: "hostname",
        header: "Internal hostname",
        cell: ({ row }) => (
          <Link
            to="/app/serves/$serveId"
            params={{ serveId: row.original.id }}
            className="font-mono text-xs hover:underline"
          >
            {row.original.internalHostname}
          </Link>
        ),
      },
      {
        id: "machine",
        header: "Machine",
        cell: ({ row }) =>
          row.original.hostname ? (
            <Link
              to="/app/machines/$endpointId"
              params={{ endpointId: row.original.endpointId }}
              className="hover:underline"
            >
              {row.original.hostname}
            </Link>
          ) : (
            <span className="font-mono text-xs">
              {row.original.endpointId.slice(0, 8)}…
            </span>
          ),
      },
      {
        id: "port",
        header: "Port",
        accessorKey: "localPort",
      },
      {
        id: "protocol",
        header: "Protocol",
        cell: ({ row }) => row.original.protocol.toUpperCase(),
      },
      {
        id: "access",
        header: "Access",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm capitalize">
            {row.original.accessMode.replace("_", " ")}
          </span>
        ),
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
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Serves"
        description="Internal hostnames for services shared across the mesh."
        actions={
          canCreate ? (
            <Button onClick={() => setCreateOpen(true)}>
              <PlusIcon className="mr-2 size-4" />
              Create serve
            </Button>
          ) : null
        }
      />

      <PageToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by hostname, machine..."
        count={filtered.length}
        countLabel={filtered.length === 1 ? "serve" : "serves"}
        filters={
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value ?? "all")}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="starting">Starting</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="stopped">Stopped</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No serves yet"
          description="Publish a local port so peers can reach it by mesh hostname."
          steps={[
            "Select an online machine and the port your service listens on.",
            "Choose who can access it - all peers, tags, or specific machines.",
            "Peers use the internal hostname, or run tunnet serve <port>.",
          ]}
          action={
            canCreate ? (
              <Button onClick={() => setCreateOpen(true)}>Create serve</Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable columns={columns} data={filtered} getRowId={(r) => r.id} />
      )}

      {orgId ? (
        <CreateServeDialog
          orgId={orgId}
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      ) : null}
    </>
  );
}
