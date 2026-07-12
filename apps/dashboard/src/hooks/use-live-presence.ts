import { useQuery } from "@tanstack/react-query";
import type { Device } from "@tuntun/api/management";
import {
  mergePresence,
  type PresencePatch,
  pickPresenceFields,
} from "@/lib/presence-patch";
import { queryKeys } from "@/lib/query-keys";

export type LivePresenceDevice = Pick<
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

export function useLivePresence(
  orgId: string | undefined,
  device: LivePresenceDevice,
): LivePresenceDevice {
  const fallback = pickPresenceFields(device);
  const { data: patch } = useQuery<PresencePatch>({
    queryKey: orgId
      ? queryKeys.devicePresence(orgId, device.endpointId)
      : ["device-presence", device.endpointId],
    queryFn: () => fallback,
    initialData: fallback,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    enabled: Boolean(orgId),
  });

  const merged = mergePresence(device, patch);
  return {
    endpointId: device.endpointId,
    networkId: merged.networkId,
    status: merged.status,
    lastSeen: device.lastSeen,
    agentConnected: merged.agentConnected,
    connectedAt: merged.connectedAt,
    disconnectedAt: merged.disconnectedAt,
    lastHeartbeatAt: merged.lastHeartbeatAt,
    publicIp: merged.publicIp,
  };
}
