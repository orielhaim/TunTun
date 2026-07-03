import { formatIp } from "@tuntun/db";
import { deviceAgentVersion, deviceHostname, deviceOs } from "@tuntun/db";

import { toIso } from "./serialize";

function formatNullableIp(value: string | null): string | null {
  if (value === null) return null;
  return formatIp(value);
}

export function serializeDevice(row: {
  endpointId: string;
  organizationId: string;
  networkId: string;
  metadata: unknown;
  assignedIp: string;
  publicIp: string | null;
  tenantIpv6: string;
  ipv6Enabled: boolean;
  agentConnected: boolean;
  connectedAt: Date | null;
  disconnectedAt: Date | null;
  lastHeartbeatAt: Date | null;
  firstSeen: Date;
  lastSeen: Date;
  status: string;
}) {
  return {
    endpointId: row.endpointId,
    organizationId: row.organizationId,
    networkId: row.networkId,
    hostname: deviceHostname(row.metadata, row.endpointId),
    os: deviceOs(row.metadata),
    agentVersion: deviceAgentVersion(row.metadata),
    assignedIp: formatIp(row.assignedIp),
    publicIp: formatNullableIp(row.publicIp),
    ipv6Enabled: row.ipv6Enabled,
    tenantIpv6:
      row.ipv6Enabled && row.tenantIpv6 ? formatIp(row.tenantIpv6) : null,
    agentConnected: row.agentConnected,
    connectedAt: toIso(row.connectedAt),
    disconnectedAt: toIso(row.disconnectedAt),
    lastHeartbeatAt: toIso(row.lastHeartbeatAt),
    firstSeen: toIso(row.firstSeen)!,
    lastSeen: toIso(row.lastSeen)!,
    status: row.status as "active" | "suspended",
  };
}

export function serializePresencePatch(row: {
  endpointId: string;
  networkId: string;
  publicIp: string | null;
  agentConnected: boolean;
  connectedAt: Date | null;
  disconnectedAt: Date | null;
  lastHeartbeatAt: Date | null;
}) {
  return {
    endpointId: row.endpointId,
    networkId: row.networkId,
    publicIp: formatNullableIp(row.publicIp),
    agentConnected: row.agentConnected,
    connectedAt: toIso(row.connectedAt),
    disconnectedAt: toIso(row.disconnectedAt),
    lastHeartbeatAt: toIso(row.lastHeartbeatAt),
  };
}

export function serializePresenceEvent(row: {
  id: number;
  endpointId: string;
  organizationId: string;
  networkId: string;
  event: string;
  publicIp: string | null;
  at: Date;
}) {
  return {
    id: row.id,
    endpointId: row.endpointId,
    organizationId: row.organizationId,
    networkId: row.networkId,
    event: row.event as "connected" | "disconnected" | "heartbeat_missed",
    publicIp: formatNullableIp(row.publicIp),
    at: toIso(row.at)!,
  };
}
