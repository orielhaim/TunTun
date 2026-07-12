import { Elysia } from "elysia";

import { apiKeysRoutes } from "./api-keys";
import { auditRoutes } from "./audit";
import { deviceProfilesRoutes } from "./device-profiles";
import { devicesRoutes } from "./devices";
import { enrollmentTokensRoutes } from "./enrollment-tokens";
import { hostnameRoutesRoutes } from "./hostname-routes";
import { internalCaRoutes } from "./internal-ca";
import { networksRoutes } from "./networks";
import { nodeGroupsRoutes } from "./node-groups";
import { policiesRoutes } from "./policies";
import { presenceRoutes } from "./presence";
import { relaysRoutes } from "./relays";
import { sdkNodesRoutes } from "./sdk-nodes";
import { servesRoutes } from "./serves";
import { subnetRoutesRoutes } from "./subnet-routes";
import { topologyRoutes } from "./topology";
import { tunnelSettingsRoutes } from "./tunnel-settings";
import { tunnelsRoutes } from "./tunnels";

export const apiV1 = new Elysia({ prefix: "/api/v1" })
  .use(networksRoutes)
  .use(devicesRoutes)
  .use(presenceRoutes)
  .use(policiesRoutes)
  .use(subnetRoutesRoutes)
  .use(hostnameRoutesRoutes)
  .use(deviceProfilesRoutes)
  .use(nodeGroupsRoutes)
  .use(topologyRoutes)
  .use(enrollmentTokensRoutes)
  .use(sdkNodesRoutes)
  .use(apiKeysRoutes)
  .use(auditRoutes)
  .use(relaysRoutes)
  .use(tunnelsRoutes)
  .use(tunnelSettingsRoutes)
  .use(internalCaRoutes)
  .use(servesRoutes);
