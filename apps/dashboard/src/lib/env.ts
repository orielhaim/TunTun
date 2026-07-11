export function getManagementApiUrl(): string {
  const url = import.meta.env.VITE_MANAGEMENT_API_URL;
  if (!url) {
    throw new Error("VITE_MANAGEMENT_API_URL is not set");
  }
  return url.replace(/\/$/, "");
}

/** Public control-plane URL agents/relays dial (falls back to management host). */
export function getControlPlaneUrl(): string {
  const url =
    import.meta.env.VITE_CONTROL_PLANE_URL ??
    import.meta.env.VITE_MANAGEMENT_API_URL;
  if (!url) return "https://cp.example.com";
  return url.replace(/\/$/, "");
}
