import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNow } from "date-fns";
import { CopyIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CreateTunnelDialog } from "@/components/app/create-tunnel-dialog";
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
import { isAdminRole, useMemberRole } from "@/hooks/use-member-role";
import { useActiveOrganization } from "@/lib/auth-client";
import { useTunnels } from "@/lib/queries/management";

export const Route = createFileRoute("/app/tunnels/")({
  component: TunnelsPage,
});

type TunnelRow = NonNullable<ReturnType<typeof useTunnels>["data"]>[number];

function TunnelsPage() {
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: role } = useMemberRole(orgId);
  const isAdmin = isAdminRole(role);
  const { data: tunnels, isPending } = useTunnels(orgId);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = tunnels ?? [];
    if (statusFilter !== "all") {
      list = list.filter((t) => t.status === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (t) =>
        t.publicHostname.toLowerCase().includes(q) ||
        t.subdomain.toLowerCase().includes(q) ||
        (t.hostname?.toLowerCase().includes(q) ?? false) ||
        (t.relayName?.toLowerCase().includes(q) ?? false) ||
        (t.networkName?.toLowerCase().includes(q) ?? false),
    );
  }, [tunnels, search, statusFilter]);

  const columns = useMemo<ColumnDef<TunnelRow>[]>(
    () => [
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <EntityStatus status={row.original.status} />,
      },
      {
        id: "url",
        header: "Public URL",
        cell: ({ row }) => {
          const url = `https://${row.original.publicHostname}`;
          return (
            <div className="flex items-center gap-1.5">
              <Link
                to="/app/tunnels/$tunnelId"
                params={{ tunnelId: row.original.id }}
                className="font-mono text-xs hover:underline"
              >
                {url}
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(url)
                    .then(() => toast.success("Copied to clipboard"));
                }}
              >
                <CopyIcon className="size-3.5" />
              </Button>
            </div>
          );
        },
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
        id: "relay",
        header: "Relay",
        cell: ({ row }) =>
          row.original.relayId ? (
            <Link
              to="/app/relays/$relayId"
              params={{ relayId: row.original.relayId }}
              className="hover:underline"
            >
              {row.original.relayName ?? "Relay"}
            </Link>
          ) : (
            "-"
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
        id: "expires",
        header: "Expires",
        cell: ({ row }) =>
          row.original.expiresAt ? (
            <span className="text-muted-foreground text-sm">
              {formatDistanceToNow(new Date(row.original.expiresAt), {
                addSuffix: true,
              })}
            </span>
          ) : (
            <span className="text-muted-foreground text-sm">Never</span>
          ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Tunnels"
        description="Public URLs that forward to ports on your machines."
        actions={
          isAdmin ? (
            <Button onClick={() => setCreateOpen(true)}>
              <PlusIcon className="mr-2 size-4" />
              Create tunnel
            </Button>
          ) : null
        }
      />

      <PageToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by URL, machine, relay..."
        count={filtered.length}
        countLabel={filtered.length === 1 ? "tunnel" : "tunnels"}
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
              <SelectItem value="connecting">Connecting</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="stopped">Stopped</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No tunnels yet"
          description="Expose a local port with a public URL through a relay."
          steps={[
            "Pick an online machine and the local port your app listens on.",
            "Choose a relay (or Auto) and an optional subdomain.",
            "Share the https://… URL - or run tunnet tunnel <port> from the CLI.",
          ]}
          action={
            isAdmin ? (
              <Button onClick={() => setCreateOpen(true)}>Create tunnel</Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable columns={columns} data={filtered} getRowId={(r) => r.id} />
      )}

      {orgId ? (
        <CreateTunnelDialog
          orgId={orgId}
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      ) : null}
    </>
  );
}
