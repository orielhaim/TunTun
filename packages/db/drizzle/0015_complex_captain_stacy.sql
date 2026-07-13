CREATE TABLE "tunnel_routing_rules" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tunnel_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"path_pattern" text,
	"external_port" integer,
	"target_endpoint_id" text,
	"target_port" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tunnel_routing_rules_kind_check" CHECK ("tunnel_routing_rules"."kind" IN ('path', 'port')),
	CONSTRAINT "tunnel_routing_rules_kind_fields_check" CHECK (("tunnel_routing_rules"."kind" = 'path' AND "tunnel_routing_rules"."path_pattern" IS NOT NULL AND "tunnel_routing_rules"."external_port" IS NULL)
          OR ("tunnel_routing_rules"."kind" = 'port' AND "tunnel_routing_rules"."external_port" IS NOT NULL AND "tunnel_routing_rules"."path_pattern" IS NULL)),
	CONSTRAINT "tunnel_routing_rules_target_port_check" CHECK ("tunnel_routing_rules"."target_port" > 0 AND "tunnel_routing_rules"."target_port" <= 65535),
	CONSTRAINT "tunnel_routing_rules_external_port_check" CHECK ("tunnel_routing_rules"."external_port" IS NULL OR ("tunnel_routing_rules"."external_port" > 0 AND "tunnel_routing_rules"."external_port" <= 65535))
);
--> statement-breakpoint
CREATE TABLE "tunnel_secrets" (
	"tunnel_id" uuid PRIMARY KEY NOT NULL,
	"relay_auth_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_policies" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tunnel_port_mappings" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tunnel_redirect_rules" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "organization_policies" CASCADE;--> statement-breakpoint
DROP TABLE "tunnel_port_mappings" CASCADE;--> statement-breakpoint
DROP TABLE "tunnel_redirect_rules" CASCADE;--> statement-breakpoint
DROP INDEX "exit_node_config_by_network_idx";--> statement-breakpoint
DROP INDEX "hostname_routes_by_network_idx";--> statement-breakpoint
DROP INDEX "policies_by_network_idx";--> statement-breakpoint
DROP INDEX "relays_by_organization_idx";--> statement-breakpoint
DROP INDEX "serves_by_network_idx";--> statement-breakpoint
DROP INDEX "ssh_policies_by_network_idx";--> statement-breakpoint
DROP INDEX "subnet_routes_by_network_idx";--> statement-breakpoint
DROP INDEX "policies_by_network_priority_idx";--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "id" SET DEFAULT uuidv7();--> statement-breakpoint
ALTER TABLE "hostname_routes" ALTER COLUMN "id" SET DEFAULT uuidv7();--> statement-breakpoint
ALTER TABLE "internal_certificates" ALTER COLUMN "id" SET DEFAULT uuidv7();--> statement-breakpoint
ALTER TABLE "networks" ALTER COLUMN "id" SET DEFAULT uuidv7();--> statement-breakpoint
ALTER TABLE "node_groups" ALTER COLUMN "id" SET DEFAULT uuidv7();--> statement-breakpoint
/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public'
                AND table_name = 'organization_cas'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

-- ALTER TABLE "organization_cas" DROP CONSTRAINT "<constraint_name>";--> statement-breakpoint
ALTER TABLE "policies" ALTER COLUMN "id" SET DEFAULT uuidv7();--> statement-breakpoint
ALTER TABLE "policies" ALTER COLUMN "network_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "relay_heartbeats" ALTER COLUMN "id" SET DEFAULT uuidv7();--> statement-breakpoint
ALTER TABLE "relays" ALTER COLUMN "id" SET DEFAULT uuidv7();--> statement-breakpoint
ALTER TABLE "serve_sessions" ALTER COLUMN "id" SET DEFAULT uuidv7();--> statement-breakpoint
ALTER TABLE "serves" ALTER COLUMN "id" SET DEFAULT uuidv7();--> statement-breakpoint
ALTER TABLE "ssh_policies" ALTER COLUMN "id" SET DEFAULT uuidv7();--> statement-breakpoint
ALTER TABLE "ssh_recordings" ALTER COLUMN "id" SET DEFAULT uuidv7();--> statement-breakpoint
ALTER TABLE "ssh_sessions" ALTER COLUMN "id" SET DEFAULT uuidv7();--> statement-breakpoint
ALTER TABLE "subnet_routes" ALTER COLUMN "id" SET DEFAULT uuidv7();--> statement-breakpoint
ALTER TABLE "tunnel_request_logs" ALTER COLUMN "id" SET DEFAULT uuidv7();--> statement-breakpoint
ALTER TABLE "tunnels" ALTER COLUMN "id" SET DEFAULT uuidv7();--> statement-breakpoint
ALTER TABLE "organization_cas" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_cas" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "policies" ADD COLUMN "organization_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "policies" ADD COLUMN "scope" text NOT NULL;--> statement-breakpoint
ALTER TABLE "tunnel_routing_rules" ADD CONSTRAINT "tunnel_routing_rules_tunnel_id_tunnels_id_fk" FOREIGN KEY ("tunnel_id") REFERENCES "public"."tunnels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tunnel_routing_rules" ADD CONSTRAINT "tunnel_routing_rules_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tunnel_secrets" ADD CONSTRAINT "tunnel_secrets_tunnel_id_tunnels_id_fk" FOREIGN KEY ("tunnel_id") REFERENCES "public"."tunnels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tunnel_routing_rules_tunnel_path_unique" ON "tunnel_routing_rules" USING btree ("tunnel_id","path_pattern") WHERE "tunnel_routing_rules"."kind" = 'path';--> statement-breakpoint
CREATE UNIQUE INDEX "tunnel_routing_rules_tunnel_port_unique" ON "tunnel_routing_rules" USING btree ("tunnel_id","external_port") WHERE "tunnel_routing_rules"."kind" = 'port';--> statement-breakpoint
CREATE INDEX "tunnel_routing_rules_by_tunnel_priority_idx" ON "tunnel_routing_rules" USING btree ("tunnel_id","priority");--> statement-breakpoint
CREATE INDEX "tunnel_routing_rules_by_organization_idx" ON "tunnel_routing_rules" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_by_organization_actor_idx" ON "audit_log" USING btree ("organization_id","actor");--> statement-breakpoint
CREATE INDEX "enrollment_tokens_by_expires_at_idx" ON "enrollment_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_cas_one_active_per_org" ON "organization_cas" USING btree ("organization_id") WHERE "organization_cas"."status" = 'active';--> statement-breakpoint
CREATE INDEX "organization_cas_by_organization_idx" ON "organization_cas" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "policies_by_org_priority_idx" ON "policies" USING btree ("organization_id","priority");--> statement-breakpoint
CREATE INDEX "relay_registration_tokens_by_expires_at_idx" ON "relay_registration_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "ssh_auth_challenges_by_expires_at_idx" ON "ssh_auth_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "policies_by_network_priority_idx" ON "policies" USING btree ("network_id","priority") WHERE "policies"."network_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "tunnels" DROP COLUMN "relay_auth_token";--> statement-breakpoint
ALTER TABLE "organization_cas" ADD CONSTRAINT "organization_cas_status_check" CHECK ("organization_cas"."status" IN ('active', 'rotated', 'revoked'));--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_scope_check" CHECK ("policies"."scope" IN ('network', 'organization'));--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_scope_network_id_check" CHECK (("policies"."scope" = 'organization' AND "policies"."network_id" IS NULL)
          OR ("policies"."scope" = 'network' AND "policies"."network_id" IS NOT NULL));