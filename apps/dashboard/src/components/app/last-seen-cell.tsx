import { memo } from "react";

import { useLivePresence } from "@/hooks/use-live-presence";
import { formatLastSeenLabel, getMachinePresence } from "@/lib/machine-utils";
import { usePresenceClock } from "@/lib/presence-clock";
import type { Device } from "@tuntun/api/management";
import { cn } from "@/lib/utils";

export const LastSeenCell = memo(function LastSeenCell({
  orgId,
  device,
}: {
  orgId?: string;
  device: Pick<
    Device,
    | "endpointId"
    | "networkId"
    | "status"
    | "lastSeen"
    | "agentConnected"
    | "connectedAt"
    | "disconnectedAt"
    | "lastHeartbeatAt"
    | "publicIp"
  >;
}) {
  const live = useLivePresence(orgId, device);
  const now = usePresenceClock();
  const presence = getMachinePresence(live, now);
  const label = formatLastSeenLabel(live, now);

  return (
    <span
      className={cn(
        "text-sm",
        presence === "online" ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
});
