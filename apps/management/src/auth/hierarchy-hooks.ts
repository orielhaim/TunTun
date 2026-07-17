import {
  DEFAULT_DYNAMIC_ROLE_POSITION,
  isStaticRoleName,
} from "@tunnet/api/auth";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
import type { RolePositionRecord } from "./hierarchy";
import {
  assertCanAssignRole,
  assertCanManageRoleDefinition,
  assertCanManageTarget,
  assertCanSetRolePosition,
  getHighestRolePosition,
  getRolePosition,
} from "./hierarchy";

type AdapterLike = {
  findOne: (args: {
    model: string;
    where: Array<{ field: string; value: string }>;
  }) => Promise<Record<string, unknown> | null>;
  findMany: (args: {
    model: string;
    where: Array<{ field: string; value: string }>;
  }) => Promise<Array<Record<string, unknown>>>;
};

type HookCtx = {
  path: string;
  body?: Record<string, unknown> | null;
  context: {
    session?: {
      user?: { id: string };
      session: { activeOrganizationId?: string | null };
    } | null;
    adapter: AdapterLike;
  };
};

async function loadDynamicRoles(
  adapter: AdapterLike,
  organizationId: string,
): Promise<RolePositionRecord[]> {
  const rows = await adapter.findMany({
    model: "organizationRole",
    where: [{ field: "organizationId", value: organizationId }],
  });
  return rows.map((row) => ({
    role: String(row.role),
    position:
      typeof row.position === "number"
        ? row.position
        : DEFAULT_DYNAMIC_ROLE_POSITION,
  }));
}

async function resolveActorMember(
  adapter: AdapterLike,
  organizationId: string,
  userId: string,
) {
  return adapter.findOne({
    model: "member",
    where: [
      { field: "organizationId", value: organizationId },
      { field: "userId", value: userId },
    ],
  });
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function roleFieldFromBody(role: unknown): string {
  if (Array.isArray(role)) {
    return role.map(String).join(",");
  }
  return String(role ?? "");
}

function requireOrgId(ctx: HookCtx): string {
  const sessionBundle = ctx.context.session;
  if (!sessionBundle?.user) {
    throw new APIError("UNAUTHORIZED");
  }
  const organizationId =
    asString(ctx.body?.organizationId) ||
    asString(sessionBundle.session.activeOrganizationId);
  if (!organizationId) {
    throw new APIError("BAD_REQUEST", {
      message: "Organization ID is required",
    });
  }
  return organizationId;
}

async function requireActor(
  adapter: AdapterLike,
  organizationId: string,
  userId: string,
) {
  const actor = await resolveActorMember(adapter, organizationId, userId);
  if (!actor) {
    throw new APIError("FORBIDDEN");
  }
  return actor;
}

async function enforceUpdateMemberRole(ctx: HookCtx) {
  const organizationId = requireOrgId(ctx);
  const session = ctx.context.session!;
  const adapter = ctx.context.adapter;
  const actor = await requireActor(adapter, organizationId, session.user?.id);

  const memberId = asString(ctx.body?.memberId);
  if (!memberId) {
    throw new APIError("BAD_REQUEST", { message: "memberId is required" });
  }

  const target = await adapter.findOne({
    model: "member",
    where: [{ field: "id", value: memberId }],
  });
  if (!target) {
    throw new APIError("BAD_REQUEST", { message: "Member not found" });
  }

  const dynamicRoles = await loadDynamicRoles(adapter, organizationId);
  const actorRank = getHighestRolePosition(String(actor.role), dynamicRoles);
  const targetRank = getHighestRolePosition(String(target.role), dynamicRoles);
  assertCanManageTarget({ actorRank, targetRank });

  const newRoleField = roleFieldFromBody(ctx.body?.role);
  const newRoleRank = getHighestRolePosition(newRoleField, dynamicRoles);
  assertCanAssignRole({ actorRank, newRoleRank });
}

async function enforceRemoveMember(ctx: HookCtx) {
  const organizationId = requireOrgId(ctx);
  const session = ctx.context.session!;
  const adapter = ctx.context.adapter;
  const actor = await requireActor(adapter, organizationId, session.user?.id);

  const memberIdOrEmail = asString(ctx.body?.memberIdOrEmail);
  if (!memberIdOrEmail) {
    throw new APIError("BAD_REQUEST", {
      message: "memberIdOrEmail is required",
    });
  }

  const byId = await adapter.findOne({
    model: "member",
    where: [{ field: "id", value: memberIdOrEmail }],
  });
  let target = byId;
  if (!target && memberIdOrEmail.includes("@")) {
    const user = await adapter.findOne({
      model: "user",
      where: [{ field: "email", value: memberIdOrEmail }],
    });
    if (user?.id) {
      target = await resolveActorMember(
        adapter,
        organizationId,
        String(user.id),
      );
    }
  }
  if (!target) {
    throw new APIError("BAD_REQUEST", { message: "Member not found" });
  }

  const dynamicRoles = await loadDynamicRoles(adapter, organizationId);
  const actorRank = getHighestRolePosition(String(actor.role), dynamicRoles);
  const targetRank = getHighestRolePosition(String(target.role), dynamicRoles);
  assertCanManageTarget({ actorRank, targetRank });
}

async function enforceInviteMember(ctx: HookCtx) {
  const organizationId = requireOrgId(ctx);
  const session = ctx.context.session!;
  const adapter = ctx.context.adapter;
  const actor = await requireActor(adapter, organizationId, session.user?.id);

  const dynamicRoles = await loadDynamicRoles(adapter, organizationId);
  const actorRank = getHighestRolePosition(String(actor.role), dynamicRoles);
  const invitedRank = getHighestRolePosition(
    roleFieldFromBody(ctx.body?.role),
    dynamicRoles,
  );
  assertCanAssignRole({ actorRank, newRoleRank: invitedRank });
}

async function enforceCreateRole(ctx: HookCtx) {
  const organizationId = requireOrgId(ctx);
  const session = ctx.context.session!;
  const adapter = ctx.context.adapter;

  const roleName = asString(ctx.body?.role);
  if (!roleName) {
    throw new APIError("BAD_REQUEST", { message: "role is required" });
  }
  if (isStaticRoleName(roleName)) {
    throw new APIError("BAD_REQUEST", {
      message: "Cannot create a role with a static role name",
    });
  }

  const actor = await requireActor(adapter, organizationId, session.user?.id);
  const dynamicRoles = await loadDynamicRoles(adapter, organizationId);
  const actorRank = getHighestRolePosition(String(actor.role), dynamicRoles);

  const additionalFields = ctx.body?.additionalFields as
    | { position?: number }
    | undefined;
  const position =
    typeof additionalFields?.position === "number"
      ? additionalFields.position
      : Math.min(actorRank - 1, DEFAULT_DYNAMIC_ROLE_POSITION);
  assertCanSetRolePosition({ actorRank, position });

  if (ctx.body && typeof ctx.body === "object") {
    const body = ctx.body as { additionalFields?: Record<string, unknown> };
    body.additionalFields = {
      ...(body.additionalFields ?? {}),
      position,
    };
  }
}

async function enforceUpdateRole(ctx: HookCtx) {
  const organizationId = requireOrgId(ctx);
  const session = ctx.context.session!;
  const adapter = ctx.context.adapter;
  const actor = await requireActor(adapter, organizationId, session.user?.id);

  const dynamicRoles = await loadDynamicRoles(adapter, organizationId);
  const actorRank = getHighestRolePosition(String(actor.role), dynamicRoles);

  const roleName = asString(ctx.body?.roleName);
  const roleId = asString(ctx.body?.roleId);
  let existingRow: Record<string, unknown> | null = null;
  if (roleId) {
    existingRow = await adapter.findOne({
      model: "organizationRole",
      where: [{ field: "id", value: roleId }],
    });
  } else if (roleName) {
    const rows = await adapter.findMany({
      model: "organizationRole",
      where: [{ field: "organizationId", value: organizationId }],
    });
    existingRow =
      rows.find(
        (r) => String(r.role).toLowerCase() === roleName.toLowerCase(),
      ) ?? null;
  }

  const currentName = String(existingRow?.role ?? roleName ?? "");
  const currentPosition =
    typeof existingRow?.position === "number"
      ? existingRow.position
      : getRolePosition(currentName, dynamicRoles);

  assertCanManageRoleDefinition({
    actorRank,
    rolePosition: currentPosition,
    roleName: currentName,
  });

  const data = ctx.body?.data as Record<string, unknown> | undefined;
  if (data && typeof data.position === "number") {
    assertCanSetRolePosition({ actorRank, position: data.position });
  }
  if (
    data &&
    typeof data.roleName === "string" &&
    isStaticRoleName(data.roleName)
  ) {
    throw new APIError("BAD_REQUEST", {
      message: "Cannot rename a role to a static role name",
    });
  }
}

async function enforceDeleteRole(ctx: HookCtx) {
  const organizationId = requireOrgId(ctx);
  const session = ctx.context.session!;
  const adapter = ctx.context.adapter;
  const actor = await requireActor(adapter, organizationId, session.user?.id);

  const dynamicRoles = await loadDynamicRoles(adapter, organizationId);
  const actorRank = getHighestRolePosition(String(actor.role), dynamicRoles);

  const roleName = asString(ctx.body?.roleName);
  const roleId = asString(ctx.body?.roleId);
  let existingRow: Record<string, unknown> | null = null;
  if (roleId) {
    existingRow = await adapter.findOne({
      model: "organizationRole",
      where: [{ field: "id", value: roleId }],
    });
  } else if (roleName) {
    const rows = await adapter.findMany({
      model: "organizationRole",
      where: [{ field: "organizationId", value: organizationId }],
    });
    existingRow =
      rows.find(
        (r) => String(r.role).toLowerCase() === roleName.toLowerCase(),
      ) ?? null;
  }

  const currentName = String(existingRow?.role ?? roleName ?? "");
  const currentPosition =
    typeof existingRow?.position === "number"
      ? existingRow.position
      : getRolePosition(currentName, dynamicRoles);

  assertCanManageRoleDefinition({
    actorRank,
    rolePosition: currentPosition,
    roleName: currentName,
  });
}

/** Top-level Better Auth `hooks.before` expects a single middleware function. */
export const hierarchyBeforeHook = createAuthMiddleware(async (ctx) => {
  const path = (ctx as { path?: string }).path ?? "";
  if (
    path !== "/organization/update-member-role" &&
    path !== "/organization/remove-member" &&
    path !== "/organization/invite-member" &&
    path !== "/organization/create-role" &&
    path !== "/organization/update-role" &&
    path !== "/organization/delete-role"
  ) {
    return;
  }

  const sessionBundle = await getSessionFromCtx(ctx);
  if (!sessionBundle) {
    throw new APIError("UNAUTHORIZED");
  }

  const hookCtx = ctx as unknown as HookCtx;
  switch (hookCtx.path) {
    case "/organization/update-member-role":
      await enforceUpdateMemberRole(hookCtx);
      break;
    case "/organization/remove-member":
      await enforceRemoveMember(hookCtx);
      break;
    case "/organization/invite-member":
      await enforceInviteMember(hookCtx);
      break;
    case "/organization/create-role":
      await enforceCreateRole(hookCtx);
      break;
    case "/organization/update-role":
      await enforceUpdateRole(hookCtx);
      break;
    case "/organization/delete-role":
      await enforceDeleteRole(hookCtx);
      break;
    default:
      break;
  }
});
