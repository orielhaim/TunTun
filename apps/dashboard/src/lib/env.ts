function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

/**
 * Management API base URL.
 *
 * - Dev: `VITE_MANAGEMENT_API_URL` (browser and SSR both hit localhost:3000).
 * - Docker/prod: dashboard proxies `/api` to management; browser uses same origin,
 *   SSR uses `MANAGEMENT_API_URL` on the internal network.
 */
export function getManagementApiUrl(): string {
  const configured = import.meta.env.VITE_MANAGEMENT_API_URL;
  if (configured) {
    return stripTrailingSlash(configured);
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  const internal = process.env.MANAGEMENT_API_URL;
  if (internal) {
    return stripTrailingSlash(internal);
  }

  return "http://localhost:3000";
}

/** Public control-plane URL agents/relays dial (falls back to management host). */
export function getControlPlaneUrl(): string {
  const url =
    import.meta.env.VITE_CONTROL_PLANE_URL ??
    import.meta.env.VITE_MANAGEMENT_API_URL;
  if (!url) return "https://cp.example.com";
  return url.replace(/\/$/, "");
}
