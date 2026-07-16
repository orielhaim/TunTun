import {
  DEFAULT_DYNAMIC_ROLE_POSITION,
  isStaticRoleName,
  parseRoleNames,
  STATIC_ROLE_POSITIONS,
} from "@tunnet/api/auth";
import { APIError } from "better-auth/api";

export type RolePositionRecord = {
  role: string;
  position?: number | null;
};

export function getStaticRolePosition(roleName: string): number | null {
  if (!isStaticRoleName(roleName)) return null;
  return STATIC_ROLE_POSITIONS[roleName];
}

export function getRolePosition(
  roleName: string,
  dynamicRoles: RolePositionRecord[],
): number {
  const staticPos = getStaticRolePosition(roleName);
  if (staticPos !== null) return staticPos;

  const found = dynamicRoles.find(
    (r) => r.role.toLowerCase() === roleName.toLowerCase(),
  );
  if (found && typeof found.position === "number") {
    return found.position;
  }
  return DEFAULT_DYNAMIC_ROLE_POSITION;
}

export function getHighestRolePosition(
  roleField: string,
  dynamicRoles: RolePositionRecord[],
): number {
  const names = parseRoleNames(roleField);
  if (names.length === 0) return 0;
  return Math.max(...names.map((name) => getRolePosition(name, dynamicRoles)));
}

export function assertCanManageTarget(opts: {
  actorRank: number;
  targetRank: number;
}): void {
  if (opts.targetRank >= opts.actorRank) {
    throw new APIError("FORBIDDEN", {
      message: "Cannot modify a member with equal or higher role",
    });
  }
}

export function assertCanAssignRole(opts: {
  actorRank: number;
  newRoleRank: number;
}): void {
  if (opts.newRoleRank >= opts.actorRank) {
    throw new APIError("FORBIDDEN", {
      message: "Cannot assign a role equal to or higher than your own",
    });
  }
}

export function assertCanManageRoleDefinition(opts: {
  actorRank: number;
  rolePosition: number;
  roleName: string;
}): void {
  if (isStaticRoleName(opts.roleName)) {
    throw new APIError("FORBIDDEN", {
      message: "Cannot modify static system roles",
    });
  }
  if (opts.rolePosition >= opts.actorRank) {
    throw new APIError("FORBIDDEN", {
      message: "Cannot manage a role equal to or higher than your own",
    });
  }
}

export function assertCanSetRolePosition(opts: {
  actorRank: number;
  position: number;
}): void {
  if (opts.position >= opts.actorRank) {
    throw new APIError("FORBIDDEN", {
      message: "Cannot place a role at or above your own rank",
    });
  }
  if (opts.position <= STATIC_ROLE_POSITIONS.member) {
    throw new APIError("BAD_REQUEST", {
      message: "Role position must be above the member baseline",
    });
  }
}
