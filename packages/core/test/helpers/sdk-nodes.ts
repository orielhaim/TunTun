import { registerSdkNodeResponse } from "@tuntun/api/management";

export type RegisterSdkNodeResult = {
  organizationId: string;
  networkId: string;
  networkName: string;
  assignedIp: string;
  networkCidr: string;
};

export async function registerSdkNode(input: {
  managementUrl: string;
  orgId: string;
  networkId: string;
  apiKeySecret: string;
  endpointId: string;
  hostname: string;
  processName?: string;
  runtime?: string;
}): Promise<{
  status: number;
  body: RegisterSdkNodeResult | { error: string };
}> {
  const url = `${input.managementUrl}/api/v1/organizations/${input.orgId}/networks/${input.networkId}/sdk-nodes`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKeySecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      endpointId: input.endpointId,
      hostname: input.hostname,
      processName: input.processName,
      runtime: input.runtime,
    }),
  });

  const body = (await response.json()) as
    | RegisterSdkNodeResult
    | { error: string };
  return { status: response.status, body };
}

export function expectRegisterSuccess(result: {
  status: number;
  body: RegisterSdkNodeResult | { error: string };
}): RegisterSdkNodeResult {
  if (result.status !== 200) {
    throw new Error(
      `sdk-nodes failed: ${result.status} ${JSON.stringify(result.body)}`,
    );
  }
  return registerSdkNodeResponse.parse(result.body);
}
