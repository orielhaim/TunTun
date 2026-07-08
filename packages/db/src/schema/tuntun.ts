import { relations, sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth";

const inet = customType<{ data: string; driverData: string }>({
  dataType() {
    return "inet";
  },
});

const cidr = customType<{ data: string; driverData: string }>({
  dataType() {
    return "cidr";
  },
});

export const policyActionValues = ["allow", "deny"] as const;
export const membershipStatusValues = [
  "active",
  "suspended",
  "pending",
] as const;

export const deviceTypeValues = ["agent", "sdk"] as const;

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** First segment after `tt_` for fast lookup before argon2.verify. */
  secretPrefix: text("secret_prefix"),
  hashedSecret: text("hashed_secret").notNull(),
  scopes: text("scopes").array().notNull().default([]),
  /** When null, the key may access every network in the organization. */
  networkIds: uuid("network_ids").array(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const networks = pgTable(
  "networks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    cidr: cidr("cidr").notNull(),
    /** 1280 = IPv6 minimum; safe for QUIC-over-UDP tunnel overhead. */
    mtu: integer("mtu").notNull().default(1280),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    version: bigint("version", { mode: "number" }).notNull().default(0),
  },
  (table) => [unique().on(table.organizationId, table.name)],
);

/** Tenant-scoped machine identity (one row per endpoint_id). */
export const devices = pgTable(
  "devices",
  {
    endpointId: text("endpoint_id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Stable ULA derived from endpoint_id at enrollment. */
    tenantIpv6: inet("tenant_ipv6").notNull().unique(),
    ipv6Enabled: boolean("ipv6_enabled").notNull().default(false),
    ipv6EnabledAt: timestamp("ipv6_enabled_at", { withTimezone: true }),
    publicIp: inet("public_ip"),
    agentConnected: boolean("agent_connected").notNull().default(false),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    firstSeen: timestamp("first_seen", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true })
      .defaultNow()
      .notNull(),
    type: text("type").notNull().default("agent"),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (table) => [
    check(
      "devices_endpoint_id_len",
      sql`char_length(${table.endpointId}) = 64`,
    ),
    check("devices_type_check", sql`${table.type} IN ('agent', 'sdk')`),
    check(
      "devices_ipv6_enabled_at_check",
      sql`(NOT ${table.ipv6Enabled}) OR (${table.ipv6EnabledAt} IS NOT NULL)`,
    ),
    index("devices_by_organization_idx").on(table.organizationId),
    index("devices_by_last_seen_idx").on(table.lastSeen),
    index("devices_by_agent_connected_idx").on(table.agentConnected),
  ],
);

/** Per-network membership and IPv4 assignment (authoritative IP ledger). */
export const networkMemberships = pgTable(
  "network_memberships",
  {
    endpointId: text("endpoint_id")
      .notNull()
      .references(() => devices.endpointId, { onDelete: "cascade" }),
    networkId: uuid("network_id")
      .notNull()
      .references(() => networks.id, { onDelete: "cascade" }),
    assignedIp: inet("assigned_ip").notNull(),
    status: text("status").notNull().default("active"),
    firstSeen: timestamp("first_seen", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true })
      .defaultNow()
      .notNull(),
    allocatedAt: timestamp("allocated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.endpointId, table.networkId] }),
    unique("network_memberships_network_id_assigned_ip_unique").on(
      table.networkId,
      table.assignedIp,
    ),
    check(
      "network_memberships_status_check",
      sql`${table.status} IN ('active', 'suspended', 'pending')`,
    ),
    index("network_memberships_by_network_idx").on(table.networkId),
    index("network_memberships_by_last_seen_idx").on(table.lastSeen),
  ],
);

export const devicePresenceEvents = pgTable(
  "device_presence_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    endpointId: text("endpoint_id")
      .notNull()
      .references(() => devices.endpointId, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    networkId: uuid("network_id")
      .notNull()
      .references(() => networks.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    publicIp: inet("public_ip"),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("device_presence_events_by_endpoint_at_idx").on(
      table.endpointId,
      table.at,
    ),
    index("device_presence_events_by_organization_at_idx").on(
      table.organizationId,
      table.at,
    ),
  ],
);

export const deviceTags = pgTable(
  "device_tags",
  {
    endpointId: text("endpoint_id")
      .notNull()
      .references(() => devices.endpointId, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (table) => [primaryKey({ columns: [table.endpointId, table.tag] })],
);

export const policies = pgTable(
  "policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    networkId: uuid("network_id")
      .notNull()
      .references(() => networks.id, { onDelete: "cascade" }),
    srcSelector: jsonb("src_selector").notNull(),
    dstSelector: jsonb("dst_selector").notNull(),
    action: text("action").notNull(),
    ports: jsonb("ports").notNull().default([]),
    protocol: text("protocol"),
    priority: integer("priority").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("policies_by_network_idx").on(table.networkId),
    index("policies_by_network_priority_idx").on(
      table.networkId,
      table.priority,
    ),
    check("policies_action_check", sql`${table.action} IN ('allow', 'deny')`),
  ],
);

export const organizationPolicies = pgTable(
  "organization_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    srcSelector: jsonb("src_selector").notNull(),
    dstSelector: jsonb("dst_selector").notNull(),
    action: text("action").notNull(),
    ports: jsonb("ports").notNull().default([]),
    protocol: text("protocol"),
    priority: integer("priority").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("organization_policies_by_organization_idx").on(table.organizationId),
    index("organization_policies_by_org_priority_idx").on(
      table.organizationId,
      table.priority,
    ),
    check(
      "organization_policies_action_check",
      sql`${table.action} IN ('allow', 'deny')`,
    ),
  ],
);

export const enrollmentTokens = pgTable("enrollment_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  networkId: uuid("network_id")
    .notNull()
    .references(() => networks.id, { onDelete: "cascade" }),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    organizationId: text("organization_id").references(() => organization.id, {
      onDelete: "set null",
    }),
    actor: text("actor"),
    action: text("action").notNull(),
    target: text("target"),
    metadata: jsonb("metadata").notNull().default({}),
    traceId: text("trace_id"),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_log_by_organization_at_idx").on(
      table.organizationId,
      table.at,
    ),
  ],
);

export const networksRelations = relations(networks, ({ one, many }) => ({
  organization: one(organization, {
    fields: [networks.organizationId],
    references: [organization.id],
  }),
  memberships: many(networkMemberships),
  policies: many(policies),
  enrollmentTokens: many(enrollmentTokens),
}));

export const devicesRelations = relations(devices, ({ one, many }) => ({
  organization: one(organization, {
    fields: [devices.organizationId],
    references: [organization.id],
  }),
  memberships: many(networkMemberships),
  tags: many(deviceTags),
  presenceEvents: many(devicePresenceEvents),
}));

export const networkMembershipsRelations = relations(
  networkMemberships,
  ({ one }) => ({
    device: one(devices, {
      fields: [networkMemberships.endpointId],
      references: [devices.endpointId],
    }),
    network: one(networks, {
      fields: [networkMemberships.networkId],
      references: [networks.id],
    }),
  }),
);

export const devicePresenceEventsRelations = relations(
  devicePresenceEvents,
  ({ one }) => ({
    device: one(devices, {
      fields: [devicePresenceEvents.endpointId],
      references: [devices.endpointId],
    }),
    organization: one(organization, {
      fields: [devicePresenceEvents.organizationId],
      references: [organization.id],
    }),
    network: one(networks, {
      fields: [devicePresenceEvents.networkId],
      references: [networks.id],
    }),
  }),
);

export const deviceTagsRelations = relations(deviceTags, ({ one }) => ({
  device: one(devices, {
    fields: [deviceTags.endpointId],
    references: [devices.endpointId],
  }),
}));

export const policiesRelations = relations(policies, ({ one }) => ({
  network: one(networks, {
    fields: [policies.networkId],
    references: [networks.id],
  }),
}));

export const organizationPoliciesRelations = relations(
  organizationPolicies,
  ({ one }) => ({
    organization: one(organization, {
      fields: [organizationPolicies.organizationId],
      references: [organization.id],
    }),
  }),
);

export const enrollmentTokensRelations = relations(
  enrollmentTokens,
  ({ one }) => ({
    organization: one(organization, {
      fields: [enrollmentTokens.organizationId],
      references: [organization.id],
    }),
    network: one(networks, {
      fields: [enrollmentTokens.networkId],
      references: [networks.id],
    }),
    creator: one(user, {
      fields: [enrollmentTokens.createdBy],
      references: [user.id],
    }),
  }),
);

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  organization: one(organization, {
    fields: [apiKeys.organizationId],
    references: [organization.id],
  }),
}));
