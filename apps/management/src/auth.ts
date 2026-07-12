import { getDb, schema } from "@tuntun/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";

import { createDefaultNetwork } from "./lib/default-network";

const db = getDb();

export const auth = betterAuth({
  appName: "TunTun Management",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      organization: schema.organization,
      member: schema.member,
      invitation: schema.invitation,
    },
  }),
  experimental: {
    joins: true,
  },
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      organizationHooks: {
        afterCreateOrganization: async ({ organization, user }) => {
          await createDefaultNetwork(organization.id, user.id);
        },
      },
    }),
  ],
  trustedOrigins: [
    process.env.MANAGEMENT_WEB_ORIGIN ?? "http://localhost:5173",
  ],
});
