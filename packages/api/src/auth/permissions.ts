import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

export const statement = {
  ...defaultStatements,
  network: ["create", "read", "update", "delete"],
  device: ["create", "read", "update", "delete", "approve"],
  relay: ["create", "read", "update", "delete"],
  apiKey: ["create", "read", "revoke"],
  policy: ["create", "read", "update", "delete"],
  tunnel: ["create", "read", "update", "delete"],
  serve: ["create", "read", "update", "delete"],
  route: ["create", "read", "update", "delete"],
  enrollment: ["create", "read", "revoke"],
  sso: ["read", "update"],
  audit: ["read"],
  transfer: ["create", "read", "accept", "reject"],
  sshSession: ["read", "terminate"],
  ca: ["read", "update"],
} as const;

export const ac = createAccessControl(statement);

const allNetwork = ["create", "read", "update", "delete"] as const;
const allDevice = ["create", "read", "update", "delete", "approve"] as const;
const allRelay = ["create", "read", "update", "delete"] as const;
const allApiKey = ["create", "read", "revoke"] as const;
const allPolicy = ["create", "read", "update", "delete"] as const;
const allTunnel = ["create", "read", "update", "delete"] as const;
const allServe = ["create", "read", "update", "delete"] as const;
const allRoute = ["create", "read", "update", "delete"] as const;
const allEnrollment = ["create", "read", "revoke"] as const;
const allTransfer = ["create", "read", "accept", "reject"] as const;
const allSshSession = ["read", "terminate"] as const;

export const owner = ac.newRole({
  ...ownerAc.statements,
  network: [...allNetwork],
  device: [...allDevice],
  relay: [...allRelay],
  apiKey: [...allApiKey],
  policy: [...allPolicy],
  tunnel: [...allTunnel],
  serve: [...allServe],
  route: [...allRoute],
  enrollment: [...allEnrollment],
  sso: ["read", "update"],
  audit: ["read"],
  transfer: [...allTransfer],
  sshSession: [...allSshSession],
  ca: ["read", "update"],
});

export const admin = ac.newRole({
  ...adminAc.statements,
  network: ["create", "read", "update"],
  device: ["create", "read", "update", "approve"],
  relay: ["read"],
  apiKey: ["create", "read"],
  policy: ["create", "read", "update", "delete"],
  tunnel: ["create", "read", "update", "delete"],
  serve: ["create", "read", "update", "delete"],
  route: ["create", "read", "update", "delete"],
  enrollment: ["create", "read", "revoke"],
  sso: ["read", "update"],
  audit: ["read"],
  transfer: ["create", "read", "accept", "reject"],
  sshSession: ["read", "terminate"],
  ca: ["read", "update"],
});

export const member = ac.newRole({
  ...memberAc.statements,
  network: ["read"],
  device: ["read"],
  relay: ["read"],
  apiKey: [],
  policy: ["read"],
  tunnel: ["read"],
  serve: ["read"],
  route: ["read"],
  enrollment: ["read"],
  sso: ["read"],
  audit: ["read"],
  transfer: ["create", "read"],
  sshSession: ["read"],
  ca: ["read"],
});

/** Discord-style hierarchy: higher number = higher rank. */
export const STATIC_ROLE_POSITIONS = {
  owner: 1000,
  admin: 500,
  member: 100,
} as const;

export const STATIC_ROLE_NAMES = ["owner", "admin", "member"] as const;

export type StaticRoleName = (typeof STATIC_ROLE_NAMES)[number];

export const DEFAULT_DYNAMIC_ROLE_POSITION = 101;

export const orgRoles = { owner, admin, member } as const;

export function isStaticRoleName(role: string): role is StaticRoleName {
  return (STATIC_ROLE_NAMES as readonly string[]).includes(role);
}

export function parseRoleNames(role: string): string[] {
  return role
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
}
