export function getManagementApiUrl(): string {
  const url = import.meta.env.VITE_MANAGEMENT_API_URL;
  if (!url) {
    throw new Error("VITE_MANAGEMENT_API_URL is not set");
  }
  return url.replace(/\/$/, "");
}
