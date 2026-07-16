import { useQuery } from "@tanstack/react-query";
import { deviceAddressesResponse } from "@tunnet/api/management";
import { memo, useState } from "react";

import { CopyField } from "@/components/app/copy-field";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { createManagementClient } from "@/lib/management-client";
import { formatNetworkName } from "@/lib/network-utils";
import { queryKeys } from "@/lib/query-keys";

type MachineAddressPopoverProps = {
  orgId: string;
  endpointId: string;
  assignedIp: string;
  ipv6Enabled?: boolean;
  tenantIpv6?: string | null;
};

export const MachineAddressPopover = memo(function MachineAddressPopover({
  orgId,
  endpointId,
  assignedIp,
  ipv6Enabled = false,
  tenantIpv6 = null,
}: MachineAddressPopoverProps) {
  const [open, setOpen] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: queryKeys.deviceAddresses(orgId, endpointId),
    enabled: open,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      const client = createManagementClient(orgId);
      return client.getDeviceAddresses(endpointId);
    },
  });

  const parsed = data ? deviceAddressesResponse.parse(data) : null;
  const resolvedIpv6Enabled = parsed?.ipv6Enabled ?? ipv6Enabled;
  const resolvedTenantIpv6 = parsed?.tenantIpv6 ?? tenantIpv6;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="link"
            className="h-auto max-w-full p-0 text-left font-mono text-xs"
          />
        }
      >
        <span className="block truncate">{assignedIp}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        {isPending ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          <>
            <CopyField
              label="Public IP"
              value={parsed?.publicIp ?? "Unknown"}
            />
            {resolvedIpv6Enabled && resolvedTenantIpv6 ? (
              <CopyField label="Tenant IPv6" value={resolvedTenantIpv6} />
            ) : (
              <p className="text-muted-foreground text-xs">
                Tenant IPv6 is not enabled for this machine.
              </p>
            )}
            <div className="space-y-3">
              <p className="text-muted-foreground text-xs font-medium">
                Virtual network addresses
              </p>
              {(parsed?.addresses ?? []).map((address) => (
                <CopyField
                  key={address.networkId}
                  label={formatNetworkName(address.networkName)}
                  value={address.assignedIp}
                />
              ))}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
});
