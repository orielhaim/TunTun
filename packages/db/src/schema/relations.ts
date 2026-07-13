import { relations } from "drizzle-orm";

import {
  account,
  invitation,
  member,
  organization,
  session,
  user,
} from "./auth";
import {
  apiKeys,
  devices,
  internalCertificates,
  networks,
  organizationCas,
  organizationTunnelSettings,
  policies,
  relays,
  serves,
  tunnels,
} from "./tuntun";

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  members: many(member),
  invitations: many(invitation),
}));

export const organizationRelations = relations(
  organization,
  ({ one, many }) => ({
    members: many(member),
    invitations: many(invitation),
    networks: many(networks),
    devices: many(devices),
    policies: many(policies),
    apiKeys: many(apiKeys),
    relays: many(relays),
    tunnels: many(tunnels),
    serves: many(serves),
    organizationCas: many(organizationCas),
    internalCertificates: many(internalCertificates),
    tunnelSettings: one(organizationTunnelSettings, {
      fields: [organization.id],
      references: [organizationTunnelSettings.organizationId],
    }),
  }),
);

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
  activeOrganization: one(organization, {
    fields: [session.activeOrganizationId],
    references: [organization.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  inviter: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));
