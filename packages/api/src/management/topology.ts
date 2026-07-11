import { z } from "zod";

export const topologyNodeKindSchema = z.enum([
  "machine",
  "subnet",
  "hostname",
  "exit",
  "relay",
]);

export const topologyNodeSchema = z.object({
  id: z.string(),
  kind: topologyNodeKindSchema,
  label: z.string(),
  secondary: z.string().nullable().optional(),
  endpointId: z.string().length(64).nullable().optional(),
  online: z.boolean().optional(),
  agentConnected: z.boolean().optional(),
  lastHeartbeatAt: z.string().datetime().nullable().optional(),
  assignedIp: z.string().nullable().optional(),
  cidr: z.string().nullable().optional(),
  viaEndpointId: z.string().length(64).nullable().optional(),
  /** Active serve count (machines). */
  serveCount: z.number().int().nonnegative().optional(),
  /** Active tunnel count (machines / relays). */
  tunnelCount: z.number().int().nonnegative().optional(),
  publicHostname: z.string().nullable().optional(),
});

export const topologyEdgeKindSchema = z.enum([
  "peer",
  "subnet",
  "hostname",
  "exit",
  "tunnel",
]);

export const topologyEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  kind: topologyEdgeKindSchema,
  /** 0–1 relative traffic intensity for particle animation. */
  intensity: z.number().min(0).max(1).default(0.35),
  latencyMs: z.number().nullable().optional(),
  direct: z.boolean().optional(),
});

export const topologyResponse = z.object({
  networkId: z.string().uuid(),
  nodes: z.array(topologyNodeSchema),
  edges: z.array(topologyEdgeSchema),
});

export const peerMetricSchema = z.object({
  fromEndpointId: z.string().length(64),
  toEndpointId: z.string().length(64),
  latencyMs: z.number().nullable(),
  bytesTx: z.number().int().nonnegative(),
  bytesRx: z.number().int().nonnegative(),
  packetLoss: z.number().min(0).max(1).nullable(),
  direct: z.boolean().nullable(),
  updatedAt: z.string().datetime(),
});

export const networkMetricsResponse = z.object({
  networkId: z.string().uuid(),
  peers: z.array(peerMetricSchema),
});

export type TopologyNode = z.infer<typeof topologyNodeSchema>;
export type TopologyEdge = z.infer<typeof topologyEdgeSchema>;
export type TopologyResponse = z.infer<typeof topologyResponse>;
export type NetworkMetricsResponse = z.infer<typeof networkMetricsResponse>;
