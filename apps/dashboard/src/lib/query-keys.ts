export const queryKeys = {
  org: (orgId: string) => ["org", orgId] as const,
  networks: (orgId: string) => [...queryKeys.org(orgId), "networks"] as const,
  network: (orgId: string, networkId: string) =>
    [...queryKeys.networks(orgId), networkId] as const,
  devices: (orgId: string, networkId: string) =>
    [...queryKeys.network(orgId, networkId), "devices"] as const,
  machines: (orgId: string) => [...queryKeys.org(orgId), "machines"] as const,
  policies: (orgId: string, networkId: string) =>
    [...queryKeys.network(orgId, networkId), "policies"] as const,
  subnetRoutes: (orgId: string, networkId: string) =>
    [...queryKeys.network(orgId, networkId), "subnet-routes"] as const,
  hostnameRoutes: (orgId: string, networkId: string) =>
    [...queryKeys.network(orgId, networkId), "hostname-routes"] as const,
  topology: (orgId: string, networkId: string) =>
    [...queryKeys.network(orgId, networkId), "topology"] as const,
  networkMetrics: (orgId: string, networkId: string) =>
    [...queryKeys.network(orgId, networkId), "metrics"] as const,
  enrollmentTokens: (orgId: string, networkId: string) =>
    [...queryKeys.network(orgId, networkId), "enrollment-tokens"] as const,
  apiKeys: (orgId: string) => [...queryKeys.org(orgId), "api-keys"] as const,
  auditLog: (orgId: string) => [...queryKeys.org(orgId), "audit-log"] as const,
  members: (orgId: string) => [...queryKeys.org(orgId), "members"] as const,
  invitations: (orgId: string) =>
    [...queryKeys.org(orgId), "invitations"] as const,
  memberRole: (orgId: string) =>
    [...queryKeys.org(orgId), "member-role"] as const,
  device: (orgId: string, endpointId: string) =>
    [...queryKeys.org(orgId), "device", endpointId] as const,
  deviceAddresses: (orgId: string, endpointId: string) =>
    [...queryKeys.org(orgId), "device-addresses", endpointId] as const,
  devicePresence: (orgId: string, endpointId: string) =>
    [...queryKeys.org(orgId), "device-presence", endpointId] as const,
};
