import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import type { Relay } from "@tuntun/api/management";
import { formatDistanceToNow } from "date-fns";
import { PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { EntityStatus } from "@/components/app/entity-status";
import { PageHeader } from "@/components/app/page-header";
import { PageToolbar } from "@/components/app/page-toolbar";
import { RegisterRelayDialog } from "@/components/app/register-relay-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isAdminRole, useMemberRole } from "@/hooks/use-member-role";
import { useActiveOrganization } from "@/lib/auth-client";
import { useRelays } from "@/lib/queries/management";

export const Route = createFileRoute("/app/relays/")({
  component: RelaysPage,
});

function RelaysPage() {
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: role } = useMemberRole(orgId);
  const isAdmin = isAdminRole(role);
  const { data: relays, isPending } = useRelays(orgId);
  const [search, setSearch] = useState("");
  const [registerOpen, setRegisterOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !relays) return relays ?? [];
    return relays.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.region.toLowerCase().includes(q) ||
        r.domain.toLowerCase().includes(q) ||
        (r.publicIp?.includes(q) ?? false),
    );
  }, [relays, search]);

  const columns = useMemo<ColumnDef<Relay>[]>(
    () => [
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <EntityStatus status={row.original.status} />,
      },
      {
        id: "name",
        header: "Name",
        cell: ({ row }) => (
          <Link
            to="/app/relays/$relayId"
            params={{ relayId: row.original.id }}
            className="font-medium hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        id: "region",
        header: "Region",
        accessorKey: "region",
      },
      {
        id: "publicIp",
        header: "Public IP",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.publicIp ?? "—"}
          </span>
        ),
      },
      {
        id: "domain",
        header: "Domain",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.domain}</span>
        ),
      },
      {
        id: "capacity",
        header: "Capacity",
        cell: ({ row }) => {
          const { activeTunnels, capacityLimit } = row.original;
          const pct =
            capacityLimit > 0
              ? Math.round((activeTunnels / capacityLimit) * 100)
              : 0;
          return (
            <span className="text-sm">
              {activeTunnels}/{capacityLimit}{" "}
              <span className="text-muted-foreground">({pct}%)</span>
            </span>
          );
        },
      },
      {
        id: "heartbeat",
        header: "Last heartbeat",
        cell: ({ row }) =>
          row.original.lastHeartbeatAt ? (
            <span className="text-muted-foreground text-sm">
              {formatDistanceToNow(new Date(row.original.lastHeartbeatAt), {
                addSuffix: true,
              })}
            </span>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          ),
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Relays"
        description="Infrastructure that terminates public tunnels for your organization."
        actions={
          isAdmin ? (
            <Button onClick={() => setRegisterOpen(true)}>
              <PlusIcon className="mr-2 size-4" />
              Register relay
            </Button>
          ) : null
        }
      />

      <PageToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, region, domain..."
        count={filtered.length}
        countLabel={filtered.length === 1 ? "relay" : "relays"}
      />

      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No relays yet"
          description="Register a self-hosted relay to terminate public tunnel traffic."
          action={
            isAdmin ? (
              <Button onClick={() => setRegisterOpen(true)}>
                Register relay
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable columns={columns} data={filtered} getRowId={(r) => r.id} />
      )}

      {orgId ? (
        <RegisterRelayDialog
          orgId={orgId}
          open={registerOpen}
          onOpenChange={setRegisterOpen}
        />
      ) : null}
    </>
  );
}
