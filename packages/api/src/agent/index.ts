import { z } from "zod";

/** Mirrors tunnet-common agent protocol shapes (documentation / client typing). */

export const enrollRequestSchema = z
  .object({
    enrollment_token: z.string().optional(),
    organization_slug: z.string().optional(),
    network_id: z.string().uuid().optional(),
    network_name: z.string().optional(),
    endpoint_id: z.string().length(64),
    hostname: z.string(),
    os: z.string(),
    agent_version: z.string(),
  })
  .refine(
    (body) =>
      Boolean(body.enrollment_token) !== Boolean(body.organization_slug),
    {
      message: "Provide exactly one of enrollment_token or organization_slug",
    },
  );

export const enrollResponseSchema = z.object({
  organization_id: z.string(),
  network_id: z.string().uuid(),
  network_name: z.string(),
  status: z.enum(["pending", "active"]).default("active"),
});

export const enrollStatusRequestSchema = z.object({
  endpoint_id: z.string().length(64),
  network_id: z.string().uuid(),
});

export const enrollStatusResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("pending"),
    organization_id: z.string(),
    network_id: z.string().uuid(),
    network_name: z.string(),
  }),
  z.object({
    status: z.literal("active"),
    organization_id: z.string(),
    network_id: z.string().uuid(),
    network_name: z.string(),
  }),
  z.object({
    status: z.literal("rejected"),
  }),
]);

export const registerRequestSchema = z.object({
  endpoint_id: z.string().length(64),
  hostname: z.string(),
  agent_version: z.string(),
});

export const pollRequestSchema = z.object({
  endpoint_id: z.string().length(64),
  known_version: z.number().int().nonnegative(),
});
