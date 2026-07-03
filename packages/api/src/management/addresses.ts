import { z } from "zod";

export const virtualNetworkAddressSchema = z.object({
  networkId: z.string().uuid(),
  networkName: z.string(),
  assignedIp: z.string(),
});

export const deviceAddressesResponse = z.object({
  endpointId: z.string().length(64),
  publicIp: z.string().nullable(),
  ipv6Enabled: z.boolean(),
  tenantIpv6: z.string().nullable(),
  addresses: z.array(virtualNetworkAddressSchema),
});

export type VirtualNetworkAddress = z.infer<typeof virtualNetworkAddressSchema>;
export type DeviceAddressesResponse = z.infer<typeof deviceAddressesResponse>;
