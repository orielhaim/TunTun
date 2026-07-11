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
