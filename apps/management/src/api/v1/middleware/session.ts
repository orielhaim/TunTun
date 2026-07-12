import { schema } from "@tuntun/db";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { auth } from "../../../auth";
import { db } from "../../../lib/db";

export type AuthContext = {
  user: { id: string; name: string; email: string };
  session: { id: string; activeOrganizationId?: string | null };
  organizationId: string;
  memberRole: string;
};

async function resolveOrgContext(
  headers: Headers,
  orgIdParam: string,
): Promise<AuthContext | null> {
  const sessionResult = await auth.api.getSession({ headers });
  if (!sessionResult?.user || !sessionResult.session) {
    return null;
  }

  const organizationId =
    orgIdParam ||
    headers.get("x-organization-id") ||
    sessionResult.session.activeOrganizationId ||
    "";

  if (!organizationId) {
    return null;
  }

  const member = await db.query.member.findFirst({
    where: and(
      eq(schema.member.organizationId, organizationId),
      eq(schema.member.userId, sessionResult.user.id),
    ),
  });

  if (!member) {
    return null;
  }

  return {
    user: {
      id: sessionResult.user.id,
      name: sessionResult.user.name,
      email: sessionResult.user.email,
    },
    session: {
      id: sessionResult.session.id,
      activeOrganizationId: sessionResult.session.activeOrganizationId,
    },
    organizationId,
    memberRole: member.role,
  };
}

export const sessionPlugin = new Elysia({ name: "session" }).derive(
  { as: "scoped" },
  async ({ request, params }) => {
    const orgId =
      typeof params === "object" &&
      params !== null &&
      "orgId" in params &&
      typeof params.orgId === "string"
        ? params.orgId
        : "";

    const authContext = await resolveOrgContext(request.headers, orgId);
    return { authContext };
  },
);

export function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

export function forbidden() {
  return new Response(JSON.stringify({ error: "Forbidden" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

export function notFound(message = "Not found") {
  return new Response(JSON.stringify({ error: message }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

export function badRequest(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

export function conflict(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 409,
    headers: { "Content-Type": "application/json" },
  });
}
