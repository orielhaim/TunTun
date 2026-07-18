import type { Device } from "@tunnet/api/management";
import {
  formatDurationCompact,
  formatDurationLong,
  parseHumanDuration,
  pgIntervalToSeconds,
} from "@tunnet/api/management";

import { getMachinePresence, type MachinePresence } from "@/lib/machine-utils";

export type ExpiryUrgency = "critical" | "warning" | null;

export type ExpiryDevice = Pick<
  Device,
  | "lastSeen"
  | "inactivityTtl"
  | "expiredAt"
  | "status"
  | "agentConnected"
  | "lastHeartbeatAt"
> & {
  /** Org default inactivity duration when device has no override. */
  orgInactivityAfter?: string | null;
  orgAutoCleanupEnabled?: boolean;
};

export function resolveInactivityTtlSecs(
  device: Pick<ExpiryDevice, "inactivityTtl"> &
    Pick<Partial<ExpiryDevice>, "orgInactivityAfter" | "orgAutoCleanupEnabled">,
): number | null {
  if (device.inactivityTtl) {
    return pgIntervalToSeconds(device.inactivityTtl);
  }
  if (device.orgAutoCleanupEnabled && device.orgInactivityAfter) {
    return parseHumanDuration(device.orgInactivityAfter);
  }
  return null;
}

export function resolveExpiresAtMs(device: ExpiryDevice): number | null {
  if (device.status === "expired" || device.expiredAt) {
    return device.expiredAt ? new Date(device.expiredAt).getTime() : Date.now();
  }
  const ttlSecs = resolveInactivityTtlSecs(device);
  if (ttlSecs === null || !device.lastSeen) return null;
  return new Date(device.lastSeen).getTime() + ttlSecs * 1000;
}

export function inactivityWindowSecs(
  device: Pick<ExpiryDevice, "inactivityTtl"> &
    Pick<Partial<ExpiryDevice>, "orgInactivityAfter" | "orgAutoCleanupEnabled">,
): number | null {
  return resolveInactivityTtlSecs(device);
}

export function deriveInactivityLimitCompact(
  device: Pick<ExpiryDevice, "inactivityTtl"> &
    Pick<Partial<ExpiryDevice>, "orgInactivityAfter" | "orgAutoCleanupEnabled">,
): string | null {
  const secs = inactivityWindowSecs(device as ExpiryDevice);
  if (secs === null) return null;
  return formatDurationCompact(secs);
}

/** True when the inactivity clock should tick (offline / stale / not online). */
export function isExpiryCountdownActive(
  device: ExpiryDevice,
  now = Date.now(),
): boolean {
  if (device.status === "expired" || device.expiredAt) return true;
  const presence = getMachinePresence(device, now);
  return presence !== "online";
}

export function getExpiryUrgency(
  device: ExpiryDevice,
  now = Date.now(),
  presence?: MachinePresence,
): ExpiryUrgency {
  if (device.status === "expired" || device.expiredAt) return "critical";

  const resolved = presence ?? getMachinePresence(device, now);
  if (resolved === "online") return null;

  const expiresAtMs = resolveExpiresAtMs(device);
  if (expiresAtMs === null) return null;

  const ttlSecs = inactivityWindowSecs(device);
  if (ttlSecs === null || ttlSecs <= 0) return null;

  const remaining = expiresAtMs - now;
  if (remaining <= 0) return "critical";
  if (remaining / (ttlSecs * 1000) < 0.2) return "warning";
  return null;
}

export function formatInactivityLimit(secs: number): string {
  return formatDurationLong(secs);
}

export function formatInactivityLimitCompact(secs: number): string {
  return formatDurationCompact(secs);
}

export function formatExpiryCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return "Expired";

  const totalSecs = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSecs / 86_400);
  const hours = Math.floor((totalSecs % 86_400) / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function formatExpiryLabel(
  device: ExpiryDevice,
  now = Date.now(),
): string | null {
  if (device.status === "expired" || device.expiredAt) return "Expired";

  const windowSecs = inactivityWindowSecs(device);
  if (windowSecs === null) return "Never expires";

  if (!isExpiryCountdownActive(device, now)) {
    return `After ${formatDurationCompact(windowSecs)} inactive`;
  }

  const expiresAtMs = resolveExpiresAtMs(device);
  if (expiresAtMs === null) return "Never expires";

  return formatExpiryCountdown(expiresAtMs - now);
}

export function matchesLabelSearch(
  labels: Record<string, string>,
  query: string,
): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;

  const colon = trimmed.indexOf(":");
  if (colon > 0) {
    const key = trimmed.slice(0, colon).toLowerCase();
    const value = trimmed.slice(colon + 1);
    const actual = labels[key];
    if (actual === undefined) {
      const matchKey = Object.keys(labels).find((k) => k.toLowerCase() === key);
      if (!matchKey) return false;
      return labels[matchKey] === value;
    }
    return actual === value;
  }

  const q = trimmed.toLowerCase();
  return Object.entries(labels).some(
    ([key, value]) =>
      key.toLowerCase().includes(q) || value.toLowerCase().includes(q),
  );
}
