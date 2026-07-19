import type { Device, Network } from "@tunnet/api/management";
import { formatDistanceToNow } from "date-fns";

import type { LivePresenceDevice } from "@/hooks/use-live-presence";

export type AggregatedMachine = Device & {
  networkName: string;
};

export function aggregateMachines(
  networks: Network[],
  devicesByNetwork: Map<string, Device[]>,
): AggregatedMachine[] {
  const machines: AggregatedMachine[] = [];

  for (const network of networks) {
    const devices = devicesByNetwork.get(network.id) ?? [];
    for (const device of devices) {
      machines.push({ ...device, networkName: network.name });
    }
  }

  return machines.sort(
    (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime(),
  );
}

export type MachinePresence =
  | "online"
  | "stale"
  | "offline"
  | "suspended"
  | "pending"
  | "expired";

/** Server clears `agentConnected` after ~90s without heartbeat. Also age client-side
 *  so a stuck WS / stale REST cache cannot keep showing Online forever. */
export const HEARTBEAT_ONLINE_MS = 90_000;

export function getMachinePresence(
  device: Pick<Device, "status" | "agentConnected" | "lastHeartbeatAt">,
  now = Date.now(),
): MachinePresence {
  if (device.status === "expired") return "expired";
  if (device.status === "suspended") return "suspended";
  if (device.status === "pending") return "pending";

  if (!device.agentConnected) {
    return "offline";
  }

  if (!device.lastHeartbeatAt) {
    return "offline";
  }

  const heartbeatAt = new Date(device.lastHeartbeatAt).getTime();
  if (Number.isNaN(heartbeatAt) || now - heartbeatAt > HEARTBEAT_ONLINE_MS) {
    return "offline";
  }

  return "online";
}

export function formatLastSeenLabel(
  device: Pick<
    LivePresenceDevice,
    | "status"
    | "lastSeen"
    | "agentConnected"
    | "lastHeartbeatAt"
    | "disconnectedAt"
  >,
  now = Date.now(),
): string {
  if (getMachinePresence(device, now) === "online") {
    return "Now";
  }

  const at = device.disconnectedAt ?? device.lastHeartbeatAt ?? device.lastSeen;

  return formatDistanceToNow(new Date(at), { addSuffix: true });
}
