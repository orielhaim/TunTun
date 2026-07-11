import { z } from "zod";

export const serveStatusSchema = z.enum([
  "starting",
  "active",
  "error",
  "stopped",
]);

export const serveProtocolSchema = z.enum(["https", "tcp"]);

export const serveAccessModeSchema = z.enum(["all_peers", "tags", "machines"]);

export const serveSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string(),
  networkId: z.string().uuid(),
  endpointId: z.string().length(64),
  localPort: z.number().int().min(1).max(65535),
  protocol: serveProtocolSchema,
  internalHostname: z.string(),
  status: serveStatusSchema,
  accessMode: serveAccessModeSchema,
  allowedTags: z.array(z.string()),
  allowedEndpointIds: z.array(z.string()),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  hostname: z.string().optional(),
});

export const servePeerSchema = z.object({
  id: z.string().uuid(),
  serveId: z.string().uuid(),
  peerEndpointId: z.string(),
  peerHostname: z.string().nullable(),
  connectedAt: z.string().datetime(),
  bytesIn: z.number().int().nonnegative(),
  bytesOut: z.number().int().nonnegative(),
  lastSeenAt: z.string().datetime(),
});

export const createServeBody = z.object({
  endpointId: z
    .string()
    .length(64)
    .regex(/^[0-9a-fA-F]+$/),
  localPort: z.number().int().min(1).max(65535),
  protocol: serveProtocolSchema.default("https"),
  accessMode: serveAccessModeSchema.default("all_peers"),
  allowedTags: z.array(z.string().min(1).max(64)).default([]),
  allowedEndpointIds: z
    .array(
      z
        .string()
        .length(64)
        .regex(/^[0-9a-fA-F]+$/),
    )
    .default([]),
});

export const patchServeBody = z
  .object({
    accessMode: serveAccessModeSchema.optional(),
    allowedTags: z.array(z.string().min(1).max(64)).optional(),
    allowedEndpointIds: z
      .array(
        z
          .string()
          .length(64)
          .regex(/^[0-9a-fA-F]+$/),
      )
      .optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: "At least one field must be provided",
  });

export const serveListResponse = z.object({
  serves: z.array(serveSchema),
});

export const createServeResponse = z.object({
  serve: serveSchema,
  certificatePem: z.string().optional(),
  privateKeyPem: z.string().optional(),
});

export const servePeersResponse = z.object({
  peers: z.array(servePeerSchema),
});

export type Serve = z.infer<typeof serveSchema>;
export type ServePeer = z.infer<typeof servePeerSchema>;
export type CreateServeBody = z.infer<typeof createServeBody>;
export type PatchServeBody = z.infer<typeof patchServeBody>;
export type CreateServeResponse = z.infer<typeof createServeResponse>;
export type ServePeersResponse = z.infer<typeof servePeersResponse>;
