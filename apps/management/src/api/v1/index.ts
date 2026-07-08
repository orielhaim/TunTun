import { Elysia } from "elysia";

import { apiKeysRoutes } from "./api-keys";
import { auditRoutes } from "./audit";
import { devicesRoutes } from "./devices";
import { enrollmentTokensRoutes } from "./enrollment-tokens";
import { networksRoutes } from "./networks";
import { policiesRoutes } from "./policies";
import { presenceRoutes } from "./presence";
import { sdkNodesRoutes } from "./sdk-nodes";

export const apiV1 = new Elysia({ prefix: "/api/v1" })
  .use(networksRoutes)
  .use(devicesRoutes)
  .use(presenceRoutes)
  .use(policiesRoutes)
  .use(enrollmentTokensRoutes)
  .use(sdkNodesRoutes)
  .use(apiKeysRoutes)
  .use(auditRoutes);
