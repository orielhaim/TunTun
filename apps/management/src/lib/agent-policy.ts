import {
  DEFAULT_NETWORK_SETTINGS,
  type NetworkSettings,
  normalizeNetworkSettings,
  type RemoteAgentPolicy,
  remoteAgentPolicySchema,
} from "@tunnet/api/management";

export function mergeAgentPolicy(
  current: RemoteAgentPolicy,
  patch: RemoteAgentPolicy,
): RemoteAgentPolicy {
  const next: RemoteAgentPolicy = { ...current, ...patch };
  if (patch.autoUpdate) {
    next.autoUpdate = {
      ...current.autoUpdate,
      ...patch.autoUpdate,
    } as RemoteAgentPolicy["autoUpdate"];
  }
  if (patch.dns) {
    next.dns = { ...current.dns, ...patch.dns };
  }
  if (patch.relay) {
    next.relay = {
      ...current.relay,
      ...patch.relay,
    } as RemoteAgentPolicy["relay"];
  }
  if (patch.exitNodes) {
    next.exitNodes = {
      ...current.exitNodes,
      ...patch.exitNodes,
    } as RemoteAgentPolicy["exitNodes"];
  }
  if (patch.posture) {
    next.posture = {
      ...current.posture,
      ...patch.posture,
    } as RemoteAgentPolicy["posture"];
  }
  return remoteAgentPolicySchema.parse(next);
}

export function mergeNetworkSettings(
  current: NetworkSettings,
  patch: { agentPolicy?: RemoteAgentPolicy },
): NetworkSettings {
  if (!patch.agentPolicy) return current;
  return {
    agentPolicy: remoteAgentPolicySchema.parse(patch.agentPolicy),
  };
}

export { DEFAULT_NETWORK_SETTINGS, normalizeNetworkSettings };
