export type DeviceMetadataRecord = Record<string, unknown>;

export function parseDeviceMetadata(metadata: unknown): DeviceMetadataRecord {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as DeviceMetadataRecord;
  }
  return {};
}

export function deviceHostname(
  metadata: unknown,
  endpointId: string,
): string {
  const value = parseDeviceMetadata(metadata).hostname;
  if (typeof value === "string" && value.length > 0) return value;
  return endpointId.slice(0, 8);
}

export function deviceOs(metadata: unknown): string | null {
  const value = parseDeviceMetadata(metadata).os;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function deviceAgentVersion(metadata: unknown): string | null {
  const value = parseDeviceMetadata(metadata).agentVersion;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function normalizeDeviceMetadata(
  metadata: unknown,
  endpointId: string,
): DeviceMetadataRecord {
  const stored = parseDeviceMetadata(metadata);
  return {
    ...stored,
    hostname: deviceHostname(metadata, endpointId),
    os: deviceOs(metadata) ?? "unknown",
    ...(deviceAgentVersion(metadata)
      ? { agentVersion: deviceAgentVersion(metadata) }
      : stored.agentVersion !== undefined
        ? { agentVersion: stored.agentVersion }
        : {}),
  };
}
