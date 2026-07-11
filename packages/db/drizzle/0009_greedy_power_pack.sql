CREATE TABLE "organization_tunnel_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"default_relay_id" uuid,
	"default_ttl_seconds" integer,
	"max_tunnels_per_machine" integer DEFAULT 10 NOT NULL,
	"peer_dns_suffix" text,
	"custom_tunnel_domain" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relay_heartbeats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relay_id" uuid NOT NULL,
	"active_tunnels" integer DEFAULT 0 NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tunnel_port_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tunnel_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"external_port" integer NOT NULL,
	"target_endpoint_id" text,
	"target_port" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tunnel_port_mappings_tunnel_external_port_unique" UNIQUE("tunnel_id","external_port"),
	CONSTRAINT "tunnel_port_mappings_external_port_check" CHECK ("tunnel_port_mappings"."external_port" > 0 AND "tunnel_port_mappings"."external_port" <= 65535),
	CONSTRAINT "tunnel_port_mappings_target_port_check" CHECK ("tunnel_port_mappings"."target_port" > 0 AND "tunnel_port_mappings"."target_port" <= 65535)
);
--> statement-breakpoint
CREATE TABLE "tunnel_redirect_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tunnel_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"path_pattern" text NOT NULL,
	"target_endpoint_id" text,
	"target_port" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tunnel_redirect_rules_target_port_check" CHECK ("tunnel_redirect_rules"."target_port" > 0 AND "tunnel_redirect_rules"."target_port" <= 65535)
);
--> statement-breakpoint
CREATE TABLE "tunnel_request_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tunnel_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status_code" integer NOT NULL,
	"latency_ms" integer NOT NULL,
	"source_ip" text,
	"request_headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tunnels" ADD COLUMN "relay_auth_token" text;--> statement-breakpoint
ALTER TABLE "tunnels" ADD COLUMN "basic_auth_user" text;--> statement-breakpoint
ALTER TABLE "tunnels" ADD COLUMN "basic_auth_password_hash" text;--> statement-breakpoint
ALTER TABLE "organization_tunnel_settings" ADD CONSTRAINT "organization_tunnel_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_tunnel_settings" ADD CONSTRAINT "organization_tunnel_settings_default_relay_id_relays_id_fk" FOREIGN KEY ("default_relay_id") REFERENCES "public"."relays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relay_heartbeats" ADD CONSTRAINT "relay_heartbeats_relay_id_relays_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tunnel_port_mappings" ADD CONSTRAINT "tunnel_port_mappings_tunnel_id_tunnels_id_fk" FOREIGN KEY ("tunnel_id") REFERENCES "public"."tunnels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tunnel_port_mappings" ADD CONSTRAINT "tunnel_port_mappings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tunnel_redirect_rules" ADD CONSTRAINT "tunnel_redirect_rules_tunnel_id_tunnels_id_fk" FOREIGN KEY ("tunnel_id") REFERENCES "public"."tunnels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tunnel_redirect_rules" ADD CONSTRAINT "tunnel_redirect_rules_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tunnel_request_logs" ADD CONSTRAINT "tunnel_request_logs_tunnel_id_tunnels_id_fk" FOREIGN KEY ("tunnel_id") REFERENCES "public"."tunnels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tunnel_request_logs" ADD CONSTRAINT "tunnel_request_logs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "relay_heartbeats_by_relay_recorded_idx" ON "relay_heartbeats" USING btree ("relay_id","recorded_at");--> statement-breakpoint
CREATE INDEX "tunnel_port_mappings_by_tunnel_idx" ON "tunnel_port_mappings" USING btree ("tunnel_id");--> statement-breakpoint
CREATE INDEX "tunnel_port_mappings_by_organization_idx" ON "tunnel_port_mappings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tunnel_redirect_rules_by_tunnel_idx" ON "tunnel_redirect_rules" USING btree ("tunnel_id");--> statement-breakpoint
CREATE INDEX "tunnel_redirect_rules_by_tunnel_priority_idx" ON "tunnel_redirect_rules" USING btree ("tunnel_id","priority");--> statement-breakpoint
CREATE INDEX "tunnel_redirect_rules_by_organization_idx" ON "tunnel_redirect_rules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tunnel_request_logs_by_tunnel_created_idx" ON "tunnel_request_logs" USING btree ("tunnel_id","created_at");--> statement-breakpoint
CREATE INDEX "tunnel_request_logs_by_organization_created_idx" ON "tunnel_request_logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "tunnel_request_logs_by_created_idx" ON "tunnel_request_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tunnels_by_expires_at_idx" ON "tunnels" USING btree ("expires_at");