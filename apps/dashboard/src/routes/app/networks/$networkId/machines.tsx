import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import type { Device } from "@tuntun/api/management";
import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { DataTable } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { LastSeenCell } from "@/components/app/last-seen-cell";
import { MachineAddressPopover } from "@/components/app/machine-address-popover";
import { StatusBadge } from "@/components/app/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  seedPresenceCache,
  usePresenceStream,
} from "@/hooks/use-presence-stream";
import { useActiveOrganization } from "@/lib/auth-client";
import { useDevices } from "@/lib/queries/management";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/networks/$networkId/machines")({
  component: NetworkMachinesPage,
});

function NetworkMachinesPage() {
  const queryClient = useQueryClient();
  const { networkId } = Route.useParams();
  const { data: activeOrg } = useActiveOrganization();
  const orgId = activeOrg?.id;
  const { data: devices, isPending } = useDevices(orgId, networkId);
  usePresenceStream(orgId);

  useEffect(() => {
    if (orgId && devices) {
      seedPresenceCache(queryClient, orgId, devices);
    }
  }, [orgId, devices, queryClient]);

  const columns = useMemo<ColumnDef<Device>[]>(
    () => [
      {
        id: "hostname",
        header: "Hostname",
        cell: ({ row }) => (
          <Link
            to="/app/machines/$endpointId"
            params={{ endpointId: row.original.endpointId }}
            className="font-medium hover:underline"
          >
            {row.original.hostname}
          </Link>
        ),
      },
      {
        id: "ip",
        header: "IP",
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
        id: "os",
        header: "OS",
        cell: ({ row }) => row.original.os ?? "—",
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
    ],
    [networkId, orgId],
  );

  if (isPending) return <Skeleton className="h-48 w-full" />;

  if ((devices?.length ?? 0) === 0) {
    return (
      <EmptyState
        title="No machines in this network"
        description="Generate an enrollment token to add a machine."
      />
    );
  }

  return (
    <DataTable
      columns={columns}
      data={devices ?? []}
      getRowId={(row) => row.endpointId}
    />
  );
}
