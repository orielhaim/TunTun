export function parseRoles(role: string): string[] {
  return role
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
}

export type OrgRole = "owner" | "admin" | "member";

export function hasRole(role: string, required: OrgRole): boolean {
  const roles = parseRoles(role);
  if (required === "member") {
    return roles.length > 0;
  }
  if (required === "admin") {
    return roles.includes("owner") || roles.includes("admin");
  }
  return roles.includes("owner");
}

export function isAdmin(role: string): boolean {
  return hasRole(role, "admin");
}
