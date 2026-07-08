import { z } from "zod";

export { SDK_ENROLL_SCOPE } from "./api-keys";

export const registerSdkNodeBody = z.object({
  endpointId: z.string().length(64),
  hostname: z.string().min(1).max(253),
  processName: z.string().max(128).optional(),
  runtime: z.string().max(128).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** Mirrors control-plane `EndpointSnapshot` (snake_case JSON). */
export const endpointSnapshotSchema = z
  .object({
    ipv6_enabled: z.boolean(),
    tenant_ipv6: z.string().nullable().optional(),
    memberships: z.array(
      z.object({
        network_id: z.string().uuid(),
        network_name: z.string(),
        assigned_ipv4: z.string(),
        prefix: z.number().int(),
        mtu: z.number().int(),
        ipv4_peers: z.array(z.unknown()),
        policy: z.unknown(),
        gossip_bootstrap: z.array(z.string()),
        gossip_topic_hex: z.string(),
        version: z.number().int().nonnegative(),
      }),
    ),
    ipv6_peers: z.array(z.unknown()).optional(),
    org_policy: z.unknown().optional(),
    version: z.number().int().nonnegative(),
  })
  .passthrough();

export const registerSdkNodeResponse = z.object({
  organizationId: z.string(),
  networkId: z.string().uuid(),
  networkName: z.string(),
  assignedIp: z.string(),
  networkCidr: z.string(),
  snapshot: endpointSnapshotSchema,
});

export type RegisterSdkNodeBody = z.infer<typeof registerSdkNodeBody>;
export type RegisterSdkNodeResponse = z.infer<typeof registerSdkNodeResponse>;
