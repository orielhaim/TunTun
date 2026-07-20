import { z } from "zod";

import { deviceStatusSchema } from "./common";
import { expiresInInputSchema } from "./duration";

export const deviceMetadataSchema = z
  .object({
    hostname: z.string(),
    os: z.string(),
    osVersion: z.string().optional(),
    arch: z.string().optional(),
    family: z.string().optional(),
    agentVersion: z.string().optional(),
    cpuCount: z.number().int().nonnegative().optional(),
    totalMemoryBytes: z.number().int().nonnegative().optional(),
    reportedAt: z.string().optional(),
  })
  .catchall(z.unknown());

export const deviceLabelsSchema = z.record(
  z.string().min(1).max(63),
  z.string().max(253),
);

export const deviceLabelsResponse = z.object({
  labels: deviceLabelsSchema,
});

export const patchDeviceLabelsBody = z
  .record(z.string().min(1).max(63), z.union([z.string().max(253), z.null()]))
  .refine((obj) => Object.keys(obj).length > 0, {
    message: "At least one label must be provided",
  });

export const deviceTypeSchema = z.enum(["agent", "sdk", "k8s"]);

/** Concrete node kind from metadata (e.g. k8s-connector); null for plain agents. */
export const deviceNodeKindSchema = z.string().min(1).max(64).nullable();

export const deviceMembershipSchema = z.object({
  networkId: z.string().uuid(),
  networkName: z.string(),
  assignedIp: z.string(),
  status: deviceStatusSchema,
  firstSeen: z.string().datetime(),
  lastSeen: z.string().datetime(),
});

export const deviceSchema = z.object({
  endpointId: z.string().length(64),
  organizationId: z.string(),
  networkId: z.string().uuid(),
  name: z.string(),
  hostname: z.string(),
  type: deviceTypeSchema,
  /** metadata.kind when present (k8s-connector, sdk, …). */
  kind: deviceNodeKindSchema.optional(),
  os: z.string().nullable(),
  agentVersion: z.string().nullable(),
  assignedIp: z.string(),
  publicIp: z.string().nullable(),
  ipv6Enabled: z.boolean(),
  tenantIpv6: z.string().nullable(),
  agentConnected: z.boolean(),
  connectedAt: z.string().datetime().nullable(),
  disconnectedAt: z.string().datetime().nullable(),
  lastHeartbeatAt: z.string().datetime().nullable(),
  firstSeen: z.string().datetime(),
  lastSeen: z.string().datetime(),
  status: deviceStatusSchema,
  labels: deviceLabelsSchema,
  tags: z.array(z.string()).default([]),
  inactivityTtl: z.string().nullable(),
  expiredAt: z.string().datetime().nullable(),
});

export const deviceDetailSchema = z.object({
  endpointId: z.string().length(64),
  organizationId: z.string(),
  name: z.string(),
  type: deviceTypeSchema,
  kind: deviceNodeKindSchema.optional(),
  metadata: deviceMetadataSchema,
  publicIp: z.string().nullable(),
  ipv6Enabled: z.boolean(),
  ipv6EnabledAt: z.string().datetime().nullable(),
  tenantIpv6: z.string(),
  agentConnected: z.boolean(),
  connectedAt: z.string().datetime().nullable(),
  disconnectedAt: z.string().datetime().nullable(),
  lastHeartbeatAt: z.string().datetime().nullable(),
  firstSeen: z.string().datetime(),
  lastSeen: z.string().datetime(),
  labels: deviceLabelsSchema,
  tags: z.array(z.string()).default([]),
  inactivityTtl: z.string().nullable(),
  expiredAt: z.string().datetime().nullable(),
  memberships: z.array(deviceMembershipSchema),
});

export const patchDeviceBody = z
  .object({
    name: z.string().trim().min(1).max(253).optional(),
    ipv6Enabled: z.boolean().optional(),
    expiresIn: expiresInInputSchema.optional(),
  })
  .refine(
    (body) =>
      body.name !== undefined ||
      body.ipv6Enabled !== undefined ||
      body.expiresIn !== undefined,
    {
      message: "At least one field must be provided",
    },
  );

export const patchDeviceMembershipBody = z.object({
  status: z.enum(["active", "suspended"]),
});

export const approveDeviceResponse = z.object({
  device: deviceSchema,
});

export const rejectDeviceResponse = z.object({
  ok: z.literal(true),
});

export const deviceListResponse = z.object({
  devices: z.array(deviceSchema),
});

export const deleteDeviceItemSchema = z.object({
  networkId: z.string().uuid(),
  endpointId: z.string().length(64),
});

export const deleteDevicesBody = z.object({
  items: z.array(deleteDeviceItemSchema).min(1).max(500),
});

export const deleteDevicesResponse = z.object({
  ok: z.literal(true),
  deleted: z.number().int().nonnegative(),
});

export type DeleteDeviceItem = z.infer<typeof deleteDeviceItemSchema>;
export type DeleteDevicesBody = z.infer<typeof deleteDevicesBody>;
export type DeleteDevicesResponse = z.infer<typeof deleteDevicesResponse>;

export type DeviceMetadata = z.infer<typeof deviceMetadataSchema>;
export type DeviceLabels = z.infer<typeof deviceLabelsSchema>;
export type DeviceMembership = z.infer<typeof deviceMembershipSchema>;
export type Device = z.infer<typeof deviceSchema>;
export type DeviceDetail = z.infer<typeof deviceDetailSchema>;
export type PatchDeviceBody = z.infer<typeof patchDeviceBody>;
export type PatchDeviceLabelsBody = z.infer<typeof patchDeviceLabelsBody>;
export type PatchDeviceMembershipBody = z.infer<
  typeof patchDeviceMembershipBody
>;
export type ApproveDeviceResponse = z.infer<typeof approveDeviceResponse>;
export type RejectDeviceResponse = z.infer<typeof rejectDeviceResponse>;
