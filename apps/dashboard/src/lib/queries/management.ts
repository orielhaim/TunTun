import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateTagDefinitionBody,
  Device,
  Network,
  PatchTagDefinitionBody,
  PolicyDriftRequest,
} from "@tunnet/api/management";

import { type AggregatedMachine, aggregateMachines } from "@/lib/machine-utils";
import { createManagementClient } from "@/lib/management-client";
import type {
  CreatePostureBody,
  CreatePostureIntegrationBody,
  PatchCustomPostureAttributeBody,
  PatchPostureSettingsBody,
  UpdatePostureBody,
  UpdatePostureIntegrationBody,
} from "@/lib/posture-types";
import { queryKeys } from "@/lib/query-keys";

export function useNetworks(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId ? queryKeys.networks(orgId) : ["networks"],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const client = createManagementClient(orgId!);
      const { networks } = await client.listNetworks();
      return networks;
    },
  });
}

export function useNetwork(orgId: string | undefined, networkId: string) {
  return useQuery({
    queryKey: orgId ? queryKeys.network(orgId, networkId) : ["network"],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const client = createManagementClient(orgId!);
      return client.getNetwork(networkId);
    },
  });
}

export function useDevices(orgId: string | undefined, networkId: string) {
  return useQuery({
    queryKey: orgId ? queryKeys.devices(orgId, networkId) : ["devices"],
    enabled: Boolean(orgId && networkId),
    queryFn: async () => {
      const client = createManagementClient(orgId!);
      const { devices } = await client.listDevices(networkId);
      return devices;
    },
    refetchInterval: false,
  });
}

export function useMachines(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId ? queryKeys.machines(orgId) : ["machines"],
    enabled: Boolean(orgId),
    queryFn: async (): Promise<AggregatedMachine[]> => {
      const client = createManagementClient(orgId!);
      const { networks } = await client.listNetworks();
      const devicesByNetwork = new Map<string, Device[]>();

      await Promise.all(
        networks.map(async (network: Network) => {
          const { devices } = await client.listDevices(network.id);
          devicesByNetwork.set(network.id, devices);
        }),
      );

      return aggregateMachines(networks, devicesByNetwork);
    },
    refetchInterval: (query) => {
      const machines = query.state.data;
      if (machines?.some((m) => m.status === "pending")) return 5_000;
      return false;
    },
  });
}

export function usePolicies(orgId: string | undefined, networkId: string) {
  return useQuery({
    queryKey: orgId ? queryKeys.policies(orgId, networkId) : ["policies"],
    enabled: Boolean(orgId && networkId),
    queryFn: async () => {
      const client = createManagementClient(orgId!);
      const { policies } = await client.listPolicies(networkId);
      return policies;
    },
  });
}

export function useOrganizationPolicies(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId
      ? queryKeys.organizationPolicies(orgId)
      : ["organization-policies"],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { policies } = await createManagementClient(
        orgId!,
      ).listOrganizationPolicies();
      return policies;
    },
  });
}

export function useTagDefinitions(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId ? queryKeys.tagDefinitions(orgId) : ["tag-definitions"],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { tags } = await createManagementClient(
        orgId!,
      ).listTagDefinitions();
      return tags;
    },
  });
}

export function usePolicyHistory(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId ? queryKeys.policyHistory(orgId) : ["policy-history"],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { revisions } = await createManagementClient(
        orgId!,
      ).listPolicyHistory();
      return revisions;
    },
  });
}

export function usePolicyEntityMutations(orgId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidateTagDefinitions = () => {
    if (orgId) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.tagDefinitions(orgId),
      });
    }
  };

  return {
    createTagDefinition: useMutation({
      mutationFn: async (body: CreateTagDefinitionBody) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).createTagDefinition(body);
      },
      onSuccess: invalidateTagDefinitions,
    }),
    patchTagDefinition: useMutation({
      mutationFn: async ({
        id,
        body,
      }: {
        id: string;
        body: PatchTagDefinitionBody;
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).patchTagDefinition(id, body);
      },
      onSuccess: invalidateTagDefinitions,
    }),
    deleteTagDefinition: useMutation({
      mutationFn: async (id: string) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).deleteTagDefinition(id);
      },
      onSuccess: invalidateTagDefinitions,
    }),
    checkPolicyDrift: useMutation({
      mutationFn: async (body: PolicyDriftRequest) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).checkPolicyDrift(body);
      },
    }),
  };
}

export function useSshPolicies(orgId: string | undefined, networkId: string) {
  return useQuery({
    queryKey: orgId
      ? queryKeys.sshPolicies(orgId, networkId)
      : ["ssh-policies"],
    enabled: Boolean(orgId && networkId),
    queryFn: async () => {
      const client = createManagementClient(orgId!);
      const { policies } = await client.listSshPolicies(networkId);
      return policies;
    },
  });
}

export function useDeviceSshAuth(
  orgId: string | undefined,
  endpointId: string,
) {
  return useQuery({
    queryKey: orgId
      ? queryKeys.deviceSshAuth(orgId, endpointId)
      : ["device-ssh-auth"],
    enabled: Boolean(orgId && endpointId),
    queryFn: async () => {
      const client = createManagementClient(orgId!);
      return client.getDeviceSshAuth(endpointId);
    },
  });
}

export function useSsoSettings(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId ? queryKeys.ssoSettings(orgId) : ["sso-settings"],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { provider } = await createManagementClient(
        orgId!,
      ).getSsoSettings();
      return provider;
    },
  });
}

export function useSsoSettingsMutations(orgId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    if (orgId) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.ssoSettings(orgId),
      });
    }
  };
  return {
    upsert: useMutation({
      mutationFn: async (
        body: Parameters<
          ReturnType<typeof createManagementClient>["upsertSsoSettings"]
        >[0],
      ) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).upsertSsoSettings(body);
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async () => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).deleteSsoSettings();
      },
      onSuccess: invalidate,
    }),
  };
}

export function useSubnetRoutes(orgId: string | undefined, networkId: string) {
  return useQuery({
    queryKey: orgId
      ? queryKeys.subnetRoutes(orgId, networkId)
      : ["subnet-routes"],
    enabled: Boolean(orgId && networkId),
    queryFn: async () => {
      const client = createManagementClient(orgId!);
      const { routes } = await client.listSubnetRoutes(networkId);
      return routes;
    },
  });
}

export function useHostnameRoutes(
  orgId: string | undefined,
  networkId: string,
) {
  return useQuery({
    queryKey: orgId
      ? queryKeys.hostnameRoutes(orgId, networkId)
      : ["hostname-routes"],
    enabled: Boolean(orgId && networkId),
    queryFn: async () => {
      const client = createManagementClient(orgId!);
      const { routes } = await client.listHostnameRoutes(networkId);
      return routes;
    },
  });
}

export function useTopology(orgId: string | undefined, networkId: string) {
  return useQuery({
    queryKey: orgId ? queryKeys.topology(orgId, networkId) : ["topology"],
    enabled: Boolean(orgId && networkId),
    queryFn: async () => {
      const client = createManagementClient(orgId!);
      return client.getTopology(networkId);
    },
    refetchInterval: 15_000,
  });
}

export function useKubernetes(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId ? queryKeys.kubernetes(orgId) : ["kubernetes"],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const client = createManagementClient(orgId!);
      return client.getKubernetes();
    },
    refetchInterval: 15_000,
  });
}

export function useNetworkMetrics(
  orgId: string | undefined,
  networkId: string,
) {
  return useQuery({
    queryKey: orgId
      ? queryKeys.networkMetrics(orgId, networkId)
      : ["network-metrics"],
    enabled: Boolean(orgId && networkId),
    queryFn: async () => {
      const client = createManagementClient(orgId!);
      return client.getNetworkMetrics(networkId);
    },
    refetchInterval: 15_000,
  });
}

export function useEnrollmentTokens(
  orgId: string | undefined,
  networkId: string,
) {
  return useQuery({
    queryKey: orgId
      ? queryKeys.enrollmentTokens(orgId, networkId)
      : ["enrollment-tokens"],
    enabled: Boolean(orgId && networkId),
    queryFn: async () => {
      const client = createManagementClient(orgId!);
      const { tokens } = await client.listEnrollmentTokens(networkId);
      return tokens;
    },
  });
}

export function useApiKeys(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId ? queryKeys.apiKeys(orgId) : ["api-keys"],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const client = createManagementClient(orgId!);
      const { apiKeys } = await client.listApiKeys();
      return apiKeys;
    },
  });
}

export function useAuditLog(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId ? queryKeys.auditLog(orgId) : ["audit-log"],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const client = createManagementClient(orgId!);
      return client.listAuditLog();
    },
  });
}

export function useInvalidateOrg(orgId: string | undefined) {
  const queryClient = useQueryClient();
  return () => {
    if (orgId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId) });
    }
  };
}

export function useNetworkMutations(orgId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    if (orgId) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.networks(orgId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.machines(orgId),
      });
    }
  };

  return {
    create: useMutation({
      mutationFn: async (
        body: Parameters<
          ReturnType<typeof createManagementClient>["createNetwork"]
        >[0],
      ) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).createNetwork(body);
      },
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: async ({
        networkId,
        body,
      }: {
        networkId: string;
        body: Parameters<
          ReturnType<typeof createManagementClient>["updateNetwork"]
        >[1];
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).updateNetwork(networkId, body);
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (networkId: string) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).deleteNetwork(networkId);
      },
      onSuccess: invalidate,
    }),
  };
}

export function useDevice(orgId: string | undefined, endpointId: string) {
  return useQuery({
    queryKey: orgId ? queryKeys.device(orgId, endpointId) : ["device"],
    enabled: Boolean(orgId && endpointId),
    queryFn: async () => {
      const client = createManagementClient(orgId!);
      return client.getDevice(endpointId);
    },
  });
}

export function useDeviceEffectiveConfig(
  orgId: string | undefined,
  endpointId: string,
) {
  return useQuery({
    queryKey:
      orgId && endpointId
        ? queryKeys.deviceConfig(orgId, endpointId)
        : ["device-config"],
    enabled: Boolean(orgId && endpointId),
    queryFn: async () =>
      createManagementClient(orgId!).getDeviceEffectiveConfig(endpointId),
    refetchInterval: 30_000,
  });
}

export function useDeviceMutations(orgId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    if (orgId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId) });
    }
  };

  const invalidateDevice = (endpointId: string) => {
    if (orgId) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.device(orgId, endpointId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.deviceAddresses(orgId, endpointId),
      });
    }
    invalidate();
  };

  return {
    update: useMutation({
      mutationFn: async ({
        endpointId,
        body,
      }: {
        endpointId: string;
        body: Parameters<
          ReturnType<typeof createManagementClient>["updateDevice"]
        >[1];
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).updateDevice(endpointId, body);
      },
      onSuccess: (_data, { endpointId }) => invalidateDevice(endpointId),
    }),
    updateLabels: useMutation({
      mutationFn: async ({
        endpointId,
        body,
      }: {
        endpointId: string;
        body: Parameters<
          ReturnType<typeof createManagementClient>["patchDeviceLabels"]
        >[1];
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).patchDeviceLabels(
          endpointId,
          body,
        );
      },
      onSuccess: (_data, { endpointId }) => invalidateDevice(endpointId),
    }),
    putTags: useMutation({
      mutationFn: async ({
        endpointId,
        tags,
      }: {
        endpointId: string;
        tags: string[];
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).putDeviceTags(endpointId, {
          tags,
        });
      },
      onSuccess: (_data, { endpointId }) => invalidateDevice(endpointId),
    }),
    bulkAssignTags: useMutation({
      mutationFn: async ({
        endpointIds,
        add,
      }: {
        endpointIds: string[];
        add: string[];
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).bulkAssignDeviceTags({
          endpointIds,
          add,
          remove: [],
        });
      },
      onSuccess: invalidate,
    }),
    updateMembership: useMutation({
      mutationFn: async ({
        networkId,
        endpointId,
        status,
      }: {
        networkId: string;
        endpointId: string;
        status: "active" | "suspended";
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).updateDeviceMembership(
          networkId,
          endpointId,
          { status },
        );
      },
      onSuccess: invalidate,
    }),
    approve: useMutation({
      mutationFn: async ({
        networkId,
        endpointId,
      }: {
        networkId: string;
        endpointId: string;
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).approveDevice(
          networkId,
          endpointId,
        );
      },
      onSuccess: invalidate,
    }),
    reject: useMutation({
      mutationFn: async ({
        networkId,
        endpointId,
      }: {
        networkId: string;
        endpointId: string;
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).rejectDevice(
          networkId,
          endpointId,
        );
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async ({
        networkId,
        endpointId,
      }: {
        networkId: string;
        endpointId: string;
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).deleteDevice(
          networkId,
          endpointId,
        );
      },
      onSuccess: invalidate,
    }),
    removeMany: useMutation({
      mutationFn: async (
        items: { networkId: string; endpointId: string }[],
      ) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).deleteDevices(items);
      },
      onSuccess: invalidate,
    }),
  };
}

export function useRelays(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId ? queryKeys.relays(orgId) : ["relays"],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { relays } = await createManagementClient(orgId!).listRelays();
      return relays;
    },
    refetchInterval: 15_000,
  });
}

export function useRelay(orgId: string | undefined, relayId: string) {
  return useQuery({
    queryKey: orgId ? queryKeys.relay(orgId, relayId) : ["relay"],
    enabled: Boolean(orgId && relayId),
    queryFn: async () => {
      const { relay } = await createManagementClient(orgId!).getRelay(relayId);
      return relay;
    },
    refetchInterval: 10_000,
  });
}

export function useRelayHealth(orgId: string | undefined, relayId: string) {
  return useQuery({
    queryKey: orgId ? queryKeys.relayHealth(orgId, relayId) : ["relay-health"],
    enabled: Boolean(orgId && relayId),
    queryFn: async () => {
      return createManagementClient(orgId!).getRelayHealth(relayId);
    },
    refetchInterval: 15_000,
  });
}

export function useTunnels(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId ? queryKeys.tunnels(orgId) : ["tunnels"],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const client = createManagementClient(orgId!);
      const { networks } = await client.listNetworks();
      const nested = await Promise.all(
        networks.map(async (network) => {
          const { tunnels } = await client.listTunnels(network.id);
          return tunnels.map((t) => ({
            ...t,
            networkName: network.name,
          }));
        }),
      );
      return nested.flat();
    },
    refetchInterval: 10_000,
  });
}

export function useTunnelRoutingRules(
  orgId: string | undefined,
  networkId: string,
  tunnelId: string,
) {
  return useQuery({
    queryKey:
      orgId && networkId && tunnelId
        ? queryKeys.tunnelRoutingRules(orgId, networkId, tunnelId)
        : ["tunnel-routing-rules"],
    enabled: Boolean(orgId && networkId && tunnelId),
    queryFn: async () => {
      const { routingRules } = await createManagementClient(
        orgId!,
      ).listTunnelRoutingRules(networkId, tunnelId);
      return routingRules;
    },
  });
}

export function useTunnelTraffic(
  orgId: string | undefined,
  networkId: string,
  tunnelId: string,
) {
  return useQuery({
    queryKey:
      orgId && networkId && tunnelId
        ? queryKeys.tunnelTraffic(orgId, networkId, tunnelId)
        : ["tunnel-traffic"],
    enabled: Boolean(orgId && networkId && tunnelId),
    queryFn: async () => {
      const { logs } = await createManagementClient(orgId!).listTunnelTraffic(
        networkId,
        tunnelId,
      );
      return logs;
    },
    refetchInterval: 5_000,
  });
}

export function useServes(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId ? queryKeys.serves(orgId) : ["serves"],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const client = createManagementClient(orgId!);
      const { networks } = await client.listNetworks();
      const nested = await Promise.all(
        networks.map(async (network) => {
          const { serves } = await client.listServes(network.id);
          return serves.map((s) => ({
            ...s,
            networkName: network.name,
          }));
        }),
      );
      return nested.flat();
    },
    refetchInterval: 10_000,
  });
}

export function useSshSessions(orgId: string | undefined, status?: string) {
  return useQuery({
    queryKey: orgId ? queryKeys.sshSessions(orgId, status) : ["ssh-sessions"],
    enabled: Boolean(orgId),
    refetchInterval: 5_000,
    queryFn: async () => {
      const { sessions } = await createManagementClient(orgId!).listSshSessions(
        { status, limit: 100 },
      );
      return sessions;
    },
  });
}

export function useSshRecordings(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId ? queryKeys.sshRecordings(orgId) : ["ssh-recordings"],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { recordings } = await createManagementClient(
        orgId!,
      ).listSshRecordings(100);
      return recordings;
    },
  });
}

export function useSshRecording(
  orgId: string | undefined,
  sessionId: string | undefined,
) {
  return useQuery({
    queryKey:
      orgId && sessionId
        ? queryKeys.sshRecording(orgId, sessionId)
        : ["ssh-recording"],
    enabled: Boolean(orgId && sessionId),
    queryFn: async () =>
      createManagementClient(orgId!).getSshRecording(sessionId!),
  });
}

export function useSshSessionMutations(orgId: string | undefined) {
  const queryClient = useQueryClient();
  return {
    kill: useMutation({
      mutationFn: async (sessionId: string) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).killSshSession(sessionId);
      },
      onSuccess: () => {
        if (orgId) {
          void queryClient.invalidateQueries({
            queryKey: [...queryKeys.org(orgId), "ssh-sessions"],
          });
        }
      },
    }),
  };
}

export function useTransfers(orgId: string | undefined, status?: string) {
  return useQuery({
    queryKey: orgId ? queryKeys.transfers(orgId, status) : ["transfers"],
    enabled: Boolean(orgId),
    refetchInterval: 3_000,
    queryFn: async () => {
      const { transfers } = await createManagementClient(orgId!).listTransfers({
        status,
        limit: 100,
      });
      return transfers;
    },
  });
}

export function useTransferMutations(orgId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    if (orgId) {
      void queryClient.invalidateQueries({
        queryKey: [...queryKeys.org(orgId), "transfers"],
      });
    }
  };
  return {
    accept: useMutation({
      mutationFn: async (args: { transferId: string; endpointId: string }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).acceptTransfer(
          args.transferId,
          args.endpointId,
        );
      },
      onSuccess: invalidate,
    }),
    reject: useMutation({
      mutationFn: async (args: {
        transferId: string;
        endpointId: string;
        reason?: string;
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).rejectTransfer(
          args.transferId,
          args.endpointId,
          args.reason,
        );
      },
      onSuccess: invalidate,
    }),
  };
}

export function useSendSettings(
  orgId: string | undefined,
  endpointId: string | undefined,
) {
  return useQuery({
    queryKey:
      orgId && endpointId
        ? queryKeys.sendSettings(orgId, endpointId)
        : ["send-settings"],
    enabled: Boolean(orgId && endpointId),
    queryFn: async () =>
      createManagementClient(orgId!).getSendSettings(endpointId!),
  });
}

export function useUpdateSendSettings(orgId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      endpointId: string;
      consentMode?: "auto_accept" | "prompt" | "deny";
      inboxPath?: string | null;
      pinBlobs?: boolean;
    }) => {
      if (!orgId) throw new Error("No organization");
      const { endpointId, ...body } = args;
      return createManagementClient(orgId).updateSendSettings(endpointId, body);
    },
    onSuccess: (_data, vars) => {
      if (orgId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.sendSettings(orgId, vars.endpointId),
        });
      }
    },
  });
}

export function useServePeers(
  orgId: string | undefined,
  networkId: string | undefined,
  serveId: string | undefined,
) {
  return useQuery({
    queryKey:
      orgId && networkId && serveId
        ? queryKeys.servePeers(orgId, networkId, serveId)
        : ["serve-peers"],
    enabled: Boolean(orgId && networkId && serveId),
    queryFn: async () => {
      const { peers } = await createManagementClient(orgId!).listServePeers(
        networkId!,
        serveId!,
      );
      return peers;
    },
    refetchInterval: 5_000,
  });
}

export function useInternalCa(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId ? queryKeys.internalCa(orgId) : ["internal-ca"],
    enabled: Boolean(orgId),
    queryFn: async () => createManagementClient(orgId!).getInternalCa(),
  });
}

export function useTunnelSettings(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId ? queryKeys.tunnelSettings(orgId) : ["tunnel-settings"],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { settings } = await createManagementClient(
        orgId!,
      ).getTunnelSettings();
      return settings;
    },
  });
}

export function useOrgSettings(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId ? queryKeys.orgSettings(orgId) : ["org-settings"],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { settings } = await createManagementClient(
        orgId!,
      ).getOrgSettings();
      return settings;
    },
  });
}

export function useRelayMutations(orgId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    if (orgId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.relays(orgId) });
    }
  };
  return {
    create: useMutation({
      mutationFn: async (
        body: Parameters<
          ReturnType<typeof createManagementClient>["createRelay"]
        >[0],
      ) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).createRelay(body);
      },
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: async ({
        relayId,
        body,
      }: {
        relayId: string;
        body: Parameters<
          ReturnType<typeof createManagementClient>["updateRelay"]
        >[1];
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).updateRelay(relayId, body);
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (relayId: string) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).deleteRelay(relayId);
      },
      onSuccess: invalidate,
    }),
  };
}

export function useTunnelMutations(orgId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    if (orgId) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.tunnels(orgId),
      });
    }
  };
  const invalidateTunnelExtras = (networkId: string, tunnelId: string) => {
    if (!orgId) return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.tunnelRoutingRules(orgId, networkId, tunnelId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.tunnelTraffic(orgId, networkId, tunnelId),
    });
  };
  return {
    create: useMutation({
      mutationFn: async ({
        networkId,
        body,
      }: {
        networkId: string;
        body: Parameters<
          ReturnType<typeof createManagementClient>["createTunnel"]
        >[1];
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).createTunnel(networkId, body);
      },
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: async ({
        networkId,
        tunnelId,
        body,
      }: {
        networkId: string;
        tunnelId: string;
        body: Parameters<
          ReturnType<typeof createManagementClient>["updateTunnel"]
        >[2];
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).updateTunnel(
          networkId,
          tunnelId,
          body,
        );
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async ({
        networkId,
        tunnelId,
      }: {
        networkId: string;
        tunnelId: string;
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).deleteTunnel(networkId, tunnelId);
      },
      onSuccess: invalidate,
    }),
    createRoutingRule: useMutation({
      mutationFn: async ({
        networkId,
        tunnelId,
        body,
      }: {
        networkId: string;
        tunnelId: string;
        body: Parameters<
          ReturnType<typeof createManagementClient>["createTunnelRoutingRule"]
        >[2];
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).createTunnelRoutingRule(
          networkId,
          tunnelId,
          body,
        );
      },
      onSuccess: (_data, { networkId, tunnelId }) =>
        invalidateTunnelExtras(networkId, tunnelId),
    }),
    updateRoutingRule: useMutation({
      mutationFn: async ({
        networkId,
        tunnelId,
        ruleId,
        body,
      }: {
        networkId: string;
        tunnelId: string;
        ruleId: string;
        body: Parameters<
          ReturnType<typeof createManagementClient>["updateTunnelRoutingRule"]
        >[3];
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).updateTunnelRoutingRule(
          networkId,
          tunnelId,
          ruleId,
          body,
        );
      },
      onSuccess: (_data, { networkId, tunnelId }) =>
        invalidateTunnelExtras(networkId, tunnelId),
    }),
    removeRoutingRule: useMutation({
      mutationFn: async ({
        networkId,
        tunnelId,
        ruleId,
      }: {
        networkId: string;
        tunnelId: string;
        ruleId: string;
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).deleteTunnelRoutingRule(
          networkId,
          tunnelId,
          ruleId,
        );
      },
      onSuccess: (_data, { networkId, tunnelId }) =>
        invalidateTunnelExtras(networkId, tunnelId),
    }),
  };
}

export function useServeMutations(orgId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    if (orgId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.serves(orgId) });
    }
  };
  return {
    create: useMutation({
      mutationFn: async ({
        networkId,
        body,
      }: {
        networkId: string;
        body: Parameters<
          ReturnType<typeof createManagementClient>["createServe"]
        >[1];
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).createServe(networkId, body);
      },
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: async ({
        networkId,
        serveId,
        body,
      }: {
        networkId: string;
        serveId: string;
        body: Parameters<
          ReturnType<typeof createManagementClient>["updateServe"]
        >[2];
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).updateServe(
          networkId,
          serveId,
          body,
        );
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async ({
        networkId,
        serveId,
      }: {
        networkId: string;
        serveId: string;
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).deleteServe(networkId, serveId);
      },
      onSuccess: invalidate,
    }),
  };
}

export function useInternalCaMutations(orgId: string | undefined) {
  const queryClient = useQueryClient();
  return {
    rotate: useMutation({
      mutationFn: async () => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).rotateInternalCa();
      },
      onSuccess: () => {
        if (orgId) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.internalCa(orgId),
          });
        }
      },
    }),
  };
}

export function useTunnelSettingsMutations(orgId: string | undefined) {
  const queryClient = useQueryClient();
  return {
    update: useMutation({
      mutationFn: async (
        body: Parameters<
          ReturnType<typeof createManagementClient>["updateTunnelSettings"]
        >[0],
      ) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).updateTunnelSettings(body);
      },
      onSuccess: () => {
        if (orgId) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.tunnelSettings(orgId),
          });
        }
      },
    }),
  };
}

export function useOrgSettingsMutations(orgId: string | undefined) {
  const queryClient = useQueryClient();
  return {
    update: useMutation({
      mutationFn: async (
        body: Parameters<
          ReturnType<typeof createManagementClient>["updateOrgSettings"]
        >[0],
      ) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).updateOrgSettings(body);
      },
      onSuccess: () => {
        if (orgId) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.orgSettings(orgId),
          });
        }
      },
    }),
  };
}

export function useDevicePosture(
  orgId: string | undefined,
  endpointId: string,
) {
  return useQuery({
    queryKey:
      orgId && endpointId
        ? queryKeys.devicePosture(orgId, endpointId)
        : ["device-posture"],
    enabled: Boolean(orgId && endpointId),
    queryFn: async () =>
      createManagementClient(orgId!).getDevicePosture(endpointId),
  });
}

export function useDevicePostureStatus(
  orgId: string | undefined,
  endpointId: string,
) {
  return useQuery({
    queryKey:
      orgId && endpointId
        ? queryKeys.devicePostureStatus(orgId, endpointId)
        : ["device-posture-status"],
    enabled: Boolean(orgId && endpointId),
    queryFn: async () =>
      createManagementClient(orgId!).getDevicePostureStatus(endpointId),
  });
}

export function useOrgPostures(orgId: string | undefined, networkId?: string) {
  return useQuery({
    queryKey: orgId ? queryKeys.postures(orgId, networkId) : ["postures"],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { postures } = await createManagementClient(orgId!).listPostures(
        networkId,
      );
      return postures;
    },
  });
}

export function usePostureCompliance(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId
      ? queryKeys.postureCompliance(orgId)
      : ["posture-compliance"],
    enabled: Boolean(orgId),
    queryFn: async () => createManagementClient(orgId!).getPostureCompliance(),
  });
}

export function usePostureIntegrations(orgId: string | undefined) {
  return useQuery({
    queryKey: orgId
      ? queryKeys.postureIntegrations(orgId)
      : ["posture-integrations"],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { integrations } = await createManagementClient(
        orgId!,
      ).listPostureIntegrations();
      return integrations;
    },
  });
}

export function usePostureSettings(
  orgId: string | undefined,
  networkId?: string,
) {
  return useQuery({
    queryKey: orgId
      ? queryKeys.postureSettings(orgId, networkId)
      : ["posture-settings"],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const response = await createManagementClient(orgId!).getPostureSettings(
        networkId,
      );
      return response;
    },
  });
}

export function usePostureMutations(orgId: string | undefined) {
  const queryClient = useQueryClient();
  const invalidateOrgPosture = () => {
    if (!orgId) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.postures(orgId) });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.postureCompliance(orgId),
    });
  };
  const invalidateDevicePosture = (endpointId: string) => {
    if (!orgId) return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.devicePosture(orgId, endpointId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.devicePostureStatus(orgId, endpointId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.postureCompliance(orgId),
    });
  };

  return {
    create: useMutation({
      mutationFn: async (body: CreatePostureBody) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).createPosture(body);
      },
      onSuccess: invalidateOrgPosture,
    }),
    update: useMutation({
      mutationFn: async ({
        name,
        body,
        networkId,
      }: {
        name: string;
        body: UpdatePostureBody;
        networkId?: string | null;
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).updatePosture(
          name,
          body,
          networkId,
        );
      },
      onSuccess: invalidateOrgPosture,
    }),
    remove: useMutation({
      mutationFn: async ({
        name,
        networkId,
      }: {
        name: string;
        networkId?: string | null;
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).deletePosture(name, networkId);
      },
      onSuccess: invalidateOrgPosture,
    }),
    patchCustomAttribute: useMutation({
      mutationFn: async ({
        endpointId,
        key,
        body,
      }: {
        endpointId: string;
        key: string;
        body: PatchCustomPostureAttributeBody;
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).patchCustomPostureAttribute(
          endpointId,
          key,
          body,
        );
      },
      onSuccess: (_data, { endpointId }) => invalidateDevicePosture(endpointId),
    }),
    removeCustomAttribute: useMutation({
      mutationFn: async ({
        endpointId,
        key,
      }: {
        endpointId: string;
        key: string;
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).deleteCustomPostureAttribute(
          endpointId,
          key,
        );
      },
      onSuccess: (_data, { endpointId }) => invalidateDevicePosture(endpointId),
    }),
    recheck: useMutation({
      mutationFn: async (endpointId: string) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).recheckDevicePosture(endpointId);
      },
      onSuccess: (_data, endpointId) => invalidateDevicePosture(endpointId),
    }),
    createIntegration: useMutation({
      mutationFn: async (body: CreatePostureIntegrationBody) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).createPostureIntegration(body);
      },
      onSuccess: () => {
        if (orgId) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.postureIntegrations(orgId),
          });
        }
      },
    }),
    updateIntegration: useMutation({
      mutationFn: async ({
        integrationId,
        body,
      }: {
        integrationId: string;
        body: UpdatePostureIntegrationBody;
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).updatePostureIntegration(
          integrationId,
          body,
        );
      },
      onSuccess: () => {
        if (orgId) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.postureIntegrations(orgId),
          });
        }
      },
    }),
    removeIntegration: useMutation({
      mutationFn: async (integrationId: string) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).deletePostureIntegration(
          integrationId,
        );
      },
      onSuccess: () => {
        if (orgId) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.postureIntegrations(orgId),
          });
        }
      },
    }),
    syncIntegration: useMutation({
      mutationFn: async (integrationId: string) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).syncPostureIntegration(
          integrationId,
        );
      },
      onSuccess: () => {
        if (orgId) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.postureIntegrations(orgId),
          });
        }
      },
    }),
    updateSettings: useMutation({
      mutationFn: async (body: PatchPostureSettingsBody) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).updatePostureSettings(body);
      },
      onSuccess: () => {
        if (orgId) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.postureSettings(orgId),
          });
        }
      },
    }),
  };
}
