import { z } from "zod";

/** Mirrors tuntun-common agent protocol shapes (documentation / client typing). */

export const enrollRequestSchema = z.object({
  enrollment_token: z.string(),
  endpoint_id: z.string().length(64),
  hostname: z.string(),
  os: z.string(),
  agent_version: z.string(),
});

export const enrollResponseSchema = z.object({
  organization_id: z.string(),
  network_id: z.string().uuid(),
  network_name: z.string(),
});

export const registerRequestSchema = z.object({
  endpoint_id: z.string().length(64),
  hostname: z.string(),
  agent_version: z.string(),
});

export const pollRequestSchema = z.object({
  endpoint_id: z.string().length(64),
  known_version: z.number().int().nonnegative(),
});
