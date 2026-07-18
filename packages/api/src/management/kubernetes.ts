import { z } from "zod";
import { deviceStatusSchema } from "./common";
import { deviceLabelsSchema, deviceTypeSchema } from "./devices";
import { k8sNodeKindSchema } from "./sdk-nodes";

export const kubernetesHubNodeKindSchema = z.union([
  k8sNodeKindSchema,
  z.literal("k8s"),
  z.string().min(1).max(64),
]);

export const kubernetesHubSubnetRouteSchema = z.object({
  id: z.string().uuid(),
  cidr: z.string(),
  enabled: z.boolean(),
  advertised: z.boolean(),
});

export const kubernetesHubNodeSchema = z.object({
  endpointId: z.string().length(64),
  name: z.string(),
  hostname: z.string(),
  networkId: z.string().uuid(),
  networkName: z.string(),
  meshIp: z.string(),
  online: z.boolean(),
  type: deviceTypeSchema,
  kind: kubernetesHubNodeKindSchema,
  labels: deviceLabelsSchema,
  tags: z.array(z.string()),
  status: deviceStatusSchema,
  lastSeen: z.string().datetime(),
  subnetRouteCount: z.number().int().nonnegative(),
  serveCount: z.number().int().nonnegative(),
  tunnelCount: z.number().int().nonnegative(),
  subnetRoutes: z.array(kubernetesHubSubnetRouteSchema),
});

export const kubernetesHubNetworkSummarySchema = z.object({
  networkId: z.string().uuid(),
  networkName: z.string(),
  nodeCount: z.number().int().nonnegative(),
  onlineCount: z.number().int().nonnegative(),
});

export const kubernetesHubResponse = z.object({
  nodes: z.array(kubernetesHubNodeSchema),
  byNetwork: z.array(kubernetesHubNetworkSummarySchema),
});

export type KubernetesHubNode = z.infer<typeof kubernetesHubNodeSchema>;
export type KubernetesHubNetworkSummary = z.infer<
  typeof kubernetesHubNetworkSummarySchema
>;
export type KubernetesHubResponse = z.infer<typeof kubernetesHubResponse>;
