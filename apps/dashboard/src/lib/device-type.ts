import type { Device } from "@tunnet/api/management";

export type DeviceType = Device["type"];

export function deviceTypeLabel(
  type: DeviceType | string | null | undefined,
): string {
  switch (type) {
    case "k8s":
      return "Kubernetes";
    case "sdk":
      return "SDK";
    case "agent":
      return "Agent";
    default:
      return type ? String(type) : "Unknown";
  }
}

export function deviceKindLabel(
  kind: string | null | undefined,
): string | null {
  if (!kind) return null;
  const map: Record<string, string> = {
    "k8s-connector": "Connector",
    "k8s-ingress": "Ingress proxy",
    "k8s-tunnel": "Tunnel proxy",
    "k8s-egress": "Egress proxy",
    "k8s-sidecar": "Sidecar",
    sdk: "SDK",
    agent: "Agent",
  };
  return map[kind] ?? kind;
}

export function canAdvertiseRoutes(
  type: DeviceType | string | null | undefined,
): boolean {
  return type !== "sdk";
}
