import type { Device } from "@tunnet/api/management";

/** Presence fields updated by the agent WebSocket session. */
export type PresencePatch = {
  endpointId: string;
  networkId: string;
  agentConnected: boolean;
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastHeartbeatAt: string | null;
  publicIp: string | null;
};

export function pickPresenceFields(
  device: Pick<
    Device,
    | "endpointId"
    | "networkId"
    | "agentConnected"
    | "connectedAt"
    | "disconnectedAt"
    | "lastHeartbeatAt"
    | "publicIp"
  >,
): PresencePatch {
  return {
    endpointId: device.endpointId,
    networkId: device.networkId,
    agentConnected: device.agentConnected,
    connectedAt: device.connectedAt,
    disconnectedAt: device.disconnectedAt,
    lastHeartbeatAt: device.lastHeartbeatAt,
    publicIp: device.publicIp,
  };
}

export function presencePatchEqual(
  a: PresencePatch | undefined,
  b: PresencePatch,
): boolean {
  if (!a) return false;
  return (
    a.agentConnected === b.agentConnected &&
    a.connectedAt === b.connectedAt &&
    a.disconnectedAt === b.disconnectedAt &&
    a.lastHeartbeatAt === b.lastHeartbeatAt &&
    a.publicIp === b.publicIp &&
    a.networkId === b.networkId
  );
}

export function mergePresence<T extends Pick<Device, "status">>(
  device: T,
  patch: PresencePatch | undefined,
): T & PresencePatch {
  if (!patch) {
    return {
      ...device,
      ...pickPresenceFields(device as unknown as Device),
    };
  }
  return { ...device, ...patch };
}
