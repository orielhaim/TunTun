export type DeviceMetadataRecord = Record<string, unknown>;

export function parseDeviceMetadata(metadata: unknown): DeviceMetadataRecord {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as DeviceMetadataRecord;
  }
  return {};
}

export function deviceHostname(metadata: unknown, endpointId: string): string {
  const value = parseDeviceMetadata(metadata).hostname;
  if (typeof value === "string" && value.length > 0) return value;
  return endpointId.slice(0, 8);
}

/** Display name with hostname fallback for legacy / empty rows. */
export function deviceDisplayName(
  name: string | null | undefined,
  metadata: unknown,
  endpointId: string,
): string {
  if (typeof name === "string" && name.trim().length > 0) return name.trim();
  return deviceHostname(metadata, endpointId);
}

export function deviceOs(metadata: unknown): string | null {
  const value = parseDeviceMetadata(metadata).os;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function deviceAgentVersion(metadata: unknown): string | null {
  const value = parseDeviceMetadata(metadata).agentVersion;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function deviceKind(
  type: string,
  metadata: unknown,
): "agent" | "sdk" | "k8s" {
  if (type === "sdk" || type === "agent" || type === "k8s") return type;
  const kind = parseDeviceMetadata(metadata).kind;
  if (kind === "sdk" || kind === "agent") return kind;
  if (typeof kind === "string" && kind.startsWith("k8s")) return "k8s";
  return "agent";
}

/** Concrete metadata.kind string (k8s-connector, sdk, …), if set. */
export function deviceNodeKind(metadata: unknown): string | null {
  const kind = parseDeviceMetadata(metadata).kind;
  if (typeof kind === "string" && kind.trim().length > 0) {
    return kind.trim().slice(0, 64);
  }
  return null;
}

export function normalizeDeviceMetadata(
  metadata: unknown,
  endpointId: string,
): DeviceMetadataRecord {
  const stored = parseDeviceMetadata(metadata);
  const agentVersion = deviceAgentVersion(metadata);
  return {
    ...stored,
    hostname: deviceHostname(metadata, endpointId),
    os: deviceOs(metadata) ?? "unknown",
    ...(agentVersion
      ? { agentVersion }
      : stored.agentVersion !== undefined
        ? { agentVersion: stored.agentVersion }
        : {}),
  };
}
