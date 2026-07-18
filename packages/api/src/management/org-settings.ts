import { z } from "zod";

import { parseHumanDuration } from "./duration";

export const autoCleanupModeSchema = z.enum(["hard", "soft", "soft_then_hard"]);

const durationStringSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .superRefine((value, ctx) => {
    if (parseHumanDuration(value) === null) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid duration (use e.g. 50s, 30m, 12h, 3d, 1w)",
      });
    }
  });

const autoCleanupFieldsSchema = z.object({
  enabled: z.boolean(),
  inactivityAfter: durationStringSchema.nullable(),
  mode: autoCleanupModeSchema,
  hardDeleteAfter: durationStringSchema.nullable(),
});

export const autoCleanupSettingsSchema = autoCleanupFieldsSchema.superRefine(
  (value, ctx) => {
    if (value.enabled && !value.inactivityAfter) {
      ctx.addIssue({
        code: "custom",
        message: "inactivityAfter is required when auto-cleanup is enabled",
        path: ["inactivityAfter"],
      });
    }
    if (
      value.mode === "soft_then_hard" &&
      value.enabled &&
      !value.hardDeleteAfter
    ) {
      ctx.addIssue({
        code: "custom",
        message: "hardDeleteAfter is required for soft_then_hard mode",
        path: ["hardDeleteAfter"],
      });
    }
  },
);

export const organizationMachinesSettingsSchema = z.object({
  autoCleanup: autoCleanupSettingsSchema,
});

export const remoteCustomScriptSchema = z.object({
  name: z.string().trim().min(1).max(128),
  path: z.string().trim().min(1).max(512),
  timeout_secs: z.number().int().positive().max(600),
});

export const remoteAutoUpdatePolicySchema = z.object({
  enabled: z.boolean(),
  checkIntervalHours: z.number().int().min(1).max(168).default(6),
});

export const remoteDnsPolicySchema = z.object({
  suffix: z.string().trim().min(1).max(63).optional(),
  upstream: z.array(z.string().trim().min(1).max(64)).max(8).default([]),
});

export const remoteRelayPolicySchema = z.object({
  preferOrgRelays: z.boolean().default(false),
});

export const remoteExitNodesPolicySchema = z.object({
  allowAdvertise: z.boolean().default(false),
  allowUse: z.boolean().default(true),
});

export const remotePostureCollectorPolicySchema = z.object({
  intervalSecs: z.number().int().min(30).max(86400).default(300),
  enabledCollectors: z.array(z.string().trim().min(1).max(64)).default([]),
  customScripts: z.array(remoteCustomScriptSchema).default([]),
});

export const remoteAgentPolicySchema = z.object({
  mdns: z.boolean().optional(),
  lanDiscovery: z.boolean().optional(),
  tunnelMtu: z.number().int().min(576).max(9000).optional(),
  autoUpdate: remoteAutoUpdatePolicySchema.optional(),
  dns: remoteDnsPolicySchema.optional(),
  relay: remoteRelayPolicySchema.optional(),
  exitNodes: remoteExitNodesPolicySchema.optional(),
  posture: remotePostureCollectorPolicySchema.optional(),
});

export const organizationSettingsSchema = z.object({
  machines: organizationMachinesSettingsSchema,
  agentPolicy: remoteAgentPolicySchema.default({}),
});

export const organizationSettingsResponse = z.object({
  organizationId: z.string(),
  settings: organizationSettingsSchema,
});

/** Patch body: fields optional; full validation runs after merge on the server. */
export const patchOrganizationSettingsBody = z
  .object({
    machines: z
      .object({
        autoCleanup: autoCleanupFieldsSchema.partial().optional(),
      })
      .optional(),
    agentPolicy: remoteAgentPolicySchema.partial().optional(),
  })
  .refine(
    (body) =>
      body.machines?.autoCleanup !== undefined ||
      body.agentPolicy !== undefined,
    {
      message: "At least one settings field must be provided",
    },
  );

export const DEFAULT_ORGANIZATION_SETTINGS: OrganizationSettings = {
  machines: {
    autoCleanup: {
      enabled: false,
      inactivityAfter: null,
      mode: "soft",
      hardDeleteAfter: null,
    },
  },
  agentPolicy: {},
};

export function normalizeOrganizationSettings(
  raw: unknown,
): OrganizationSettings {
  const parsed = organizationSettingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  const partial =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const machines =
    partial.machines &&
    typeof partial.machines === "object" &&
    !Array.isArray(partial.machines)
      ? (partial.machines as Record<string, unknown>)
      : {};
  const autoCleanup =
    machines.autoCleanup &&
    typeof machines.autoCleanup === "object" &&
    !Array.isArray(machines.autoCleanup)
      ? (machines.autoCleanup as Record<string, unknown>)
      : {};

  const agentPolicy =
    partial.agentPolicy &&
    typeof partial.agentPolicy === "object" &&
    !Array.isArray(partial.agentPolicy)
      ? partial.agentPolicy
      : {};

  const merged = {
    machines: {
      autoCleanup: {
        ...DEFAULT_ORGANIZATION_SETTINGS.machines.autoCleanup,
        ...autoCleanup,
      },
    },
    agentPolicy,
  };

  const result = organizationSettingsSchema.safeParse(merged);
  return result.success ? result.data : DEFAULT_ORGANIZATION_SETTINGS;
}

export const configSourceSchema = z.enum(["default", "remote", "local"]);

export const resolvedSettingSchema = <T extends z.ZodType>(value: T) =>
  z.object({
    value,
    source: configSourceSchema,
    remoteValue: value.optional(),
  });

export const effectiveAgentConfigSchema = z.object({
  mdns: resolvedSettingSchema(z.boolean()),
  lanDiscovery: resolvedSettingSchema(z.boolean()),
  tunnelMtu: resolvedSettingSchema(z.number().int()),
  autoUpdateEnabled: resolvedSettingSchema(z.boolean()),
  autoUpdateCheckIntervalHours: resolvedSettingSchema(z.number().int()),
  postureIntervalSecs: resolvedSettingSchema(z.number().int()),
  postureEnabledCollectors: resolvedSettingSchema(z.array(z.string())),
  preferOrgRelays: resolvedSettingSchema(z.boolean()),
  exitNodesAllowAdvertise: resolvedSettingSchema(z.boolean()),
  exitNodesAllowUse: resolvedSettingSchema(z.boolean()),
  dnsSuffix: resolvedSettingSchema(z.string()),
  dnsUpstream: resolvedSettingSchema(z.array(z.string())),
  local: z.object({
    loggingLevel: z.string(),
    loggingFormat: z.string(),
    controlUrl: z.string().nullable().optional(),
    listenPort: z.number().int().nullable().optional(),
  }),
});

export const networkSettingsSchema = z.object({
  agentPolicy: remoteAgentPolicySchema.default({}),
});

export const DEFAULT_NETWORK_SETTINGS: NetworkSettings = {
  agentPolicy: {},
};

export function normalizeNetworkSettings(raw: unknown): NetworkSettings {
  const parsed = networkSettingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  const partial =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const agentPolicy =
    partial.agentPolicy &&
    typeof partial.agentPolicy === "object" &&
    !Array.isArray(partial.agentPolicy)
      ? partial.agentPolicy
      : {};

  const merged = { agentPolicy };
  const result = networkSettingsSchema.safeParse(merged);
  return result.success ? result.data : DEFAULT_NETWORK_SETTINGS;
}

/** Deep-merge network overrides onto org defaults (network wins when set). */
export function inheritRemoteAgentPolicy(
  org: RemoteAgentPolicy,
  network: RemoteAgentPolicy,
): RemoteAgentPolicy {
  const mergedDns =
    network.dns || org.dns
      ? {
          suffix: network.dns?.suffix ?? org.dns?.suffix,
          upstream:
            network.dns?.upstream && network.dns.upstream.length > 0
              ? network.dns.upstream
              : (org.dns?.upstream ?? []),
        }
      : undefined;

  const mergedPosture =
    network.posture || org.posture
      ? {
          intervalSecs:
            network.posture?.intervalSecs ?? org.posture?.intervalSecs ?? 300,
          enabledCollectors:
            network.posture?.enabledCollectors &&
            network.posture.enabledCollectors.length > 0
              ? network.posture.enabledCollectors
              : (org.posture?.enabledCollectors ?? []),
          customScripts:
            network.posture?.customScripts &&
            network.posture.customScripts.length > 0
              ? network.posture.customScripts
              : (org.posture?.customScripts ?? []),
        }
      : undefined;

  return remoteAgentPolicySchema.parse({
    mdns: network.mdns ?? org.mdns,
    lanDiscovery: network.lanDiscovery ?? org.lanDiscovery,
    tunnelMtu: network.tunnelMtu ?? org.tunnelMtu,
    autoUpdate: network.autoUpdate ?? org.autoUpdate,
    dns: mergedDns,
    relay: network.relay ?? org.relay,
    exitNodes: network.exitNodes ?? org.exitNodes,
    posture: mergedPosture,
  });
}

export const deviceEffectiveConfigResponse = z.object({
  endpointId: z.string().length(64),
  networkId: z.string().uuid().nullable(),
  config: effectiveAgentConfigSchema.nullable(),
  reportedAt: z.string().datetime().nullable(),
  remotePolicy: remoteAgentPolicySchema,
});

export type AutoCleanupMode = z.infer<typeof autoCleanupModeSchema>;
export type AutoCleanupSettings = z.infer<typeof autoCleanupSettingsSchema>;
export type OrganizationMachinesSettings = z.infer<
  typeof organizationMachinesSettingsSchema
>;
export type RemoteAgentPolicy = z.infer<typeof remoteAgentPolicySchema>;
export type NetworkSettings = z.infer<typeof networkSettingsSchema>;
export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>;
export type OrganizationSettingsResponse = z.infer<
  typeof organizationSettingsResponse
>;
export type PatchOrganizationSettingsBody = z.infer<
  typeof patchOrganizationSettingsBody
>;
export type ConfigSource = z.infer<typeof configSourceSchema>;
export type EffectiveAgentConfig = z.infer<typeof effectiveAgentConfigSchema>;
export type DeviceEffectiveConfigResponse = z.infer<
  typeof deviceEffectiveConfigResponse
>;
