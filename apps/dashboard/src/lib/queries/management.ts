import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Device, Network } from "@tuntun/api/management";

import { aggregateMachines, type AggregatedMachine } from "@/lib/machine-utils";
import { createManagementClient } from "@/lib/management-client";
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
    refetchInterval: false,
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

export function useTunnelRedirectRules(
  orgId: string | undefined,
  networkId: string,
  tunnelId: string,
) {
  return useQuery({
    queryKey:
      orgId && networkId && tunnelId
        ? queryKeys.tunnelRedirectRules(orgId, networkId, tunnelId)
        : ["tunnel-redirect-rules"],
    enabled: Boolean(orgId && networkId && tunnelId),
    queryFn: async () => {
      const { redirectRules } = await createManagementClient(
        orgId!,
      ).listTunnelRedirectRules(networkId, tunnelId);
      return redirectRules;
    },
  });
}

export function useTunnelPortMappings(
  orgId: string | undefined,
  networkId: string,
  tunnelId: string,
) {
  return useQuery({
    queryKey:
      orgId && networkId && tunnelId
        ? queryKeys.tunnelPortMappings(orgId, networkId, tunnelId)
        : ["tunnel-port-mappings"],
    enabled: Boolean(orgId && networkId && tunnelId),
    queryFn: async () => {
      const { portMappings } = await createManagementClient(
        orgId!,
      ).listTunnelPortMappings(networkId, tunnelId);
      return portMappings;
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
      queryKey: queryKeys.tunnelRedirectRules(orgId, networkId, tunnelId),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.tunnelPortMappings(orgId, networkId, tunnelId),
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
    createRedirectRule: useMutation({
      mutationFn: async ({
        networkId,
        tunnelId,
        body,
      }: {
        networkId: string;
        tunnelId: string;
        body: Parameters<
          ReturnType<typeof createManagementClient>["createTunnelRedirectRule"]
        >[2];
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).createTunnelRedirectRule(
          networkId,
          tunnelId,
          body,
        );
      },
      onSuccess: (_data, { networkId, tunnelId }) =>
        invalidateTunnelExtras(networkId, tunnelId),
    }),
    updateRedirectRule: useMutation({
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
          ReturnType<typeof createManagementClient>["updateTunnelRedirectRule"]
        >[3];
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).updateTunnelRedirectRule(
          networkId,
          tunnelId,
          ruleId,
          body,
        );
      },
      onSuccess: (_data, { networkId, tunnelId }) =>
        invalidateTunnelExtras(networkId, tunnelId),
    }),
    removeRedirectRule: useMutation({
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
        return createManagementClient(orgId).deleteTunnelRedirectRule(
          networkId,
          tunnelId,
          ruleId,
        );
      },
      onSuccess: (_data, { networkId, tunnelId }) =>
        invalidateTunnelExtras(networkId, tunnelId),
    }),
    createPortMapping: useMutation({
      mutationFn: async ({
        networkId,
        tunnelId,
        body,
      }: {
        networkId: string;
        tunnelId: string;
        body: Parameters<
          ReturnType<typeof createManagementClient>["createTunnelPortMapping"]
        >[2];
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).createTunnelPortMapping(
          networkId,
          tunnelId,
          body,
        );
      },
      onSuccess: (_data, { networkId, tunnelId }) =>
        invalidateTunnelExtras(networkId, tunnelId),
    }),
    removePortMapping: useMutation({
      mutationFn: async ({
        networkId,
        tunnelId,
        mappingId,
      }: {
        networkId: string;
        tunnelId: string;
        mappingId: string;
      }) => {
        if (!orgId) throw new Error("No organization");
        return createManagementClient(orgId).deleteTunnelPortMapping(
          networkId,
          tunnelId,
          mappingId,
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
