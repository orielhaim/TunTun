CREATE TABLE "internal_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"endpoint_id" text NOT NULL,
	"hostname" text NOT NULL,
	"certificate_pem" text NOT NULL,
	"encrypted_private_key" text NOT NULL,
	"fingerprint_sha256" text NOT NULL,
	"not_before" timestamp with time zone NOT NULL,
	"not_after" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "internal_certificates_endpoint_hostname_unique" UNIQUE("endpoint_id","hostname")
);
--> statement-breakpoint
CREATE TABLE "organization_cas" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"certificate_pem" text NOT NULL,
	"encrypted_private_key" text NOT NULL,
	"fingerprint_sha256" text NOT NULL,
	"not_before" timestamp with time zone NOT NULL,
	"not_after" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "relay_registration_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"relay_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'self_hosted' NOT NULL,
	"region" text DEFAULT 'unknown' NOT NULL,
	"public_ip" "inet",
	"domain" text NOT NULL,
	"capacity_limit" integer DEFAULT 100 NOT NULL,
	"active_tunnels" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_heartbeat_at" timestamp with time zone,
	"public_key" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relays_organization_name_unique" UNIQUE("organization_id","name"),
	CONSTRAINT "relays_organization_domain_unique" UNIQUE("organization_id","domain"),
	CONSTRAINT "relays_kind_check" CHECK ("relays"."kind" IN ('hosted', 'self_hosted')),
	CONSTRAINT "relays_status_check" CHECK ("relays"."status" IN ('pending', 'healthy', 'degraded', 'offline', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "serves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"network_id" uuid NOT NULL,
	"endpoint_id" text NOT NULL,
	"local_port" integer NOT NULL,
	"protocol" text DEFAULT 'https' NOT NULL,
	"internal_hostname" text NOT NULL,
	"status" text DEFAULT 'starting' NOT NULL,
	"access_mode" text DEFAULT 'all_peers' NOT NULL,
	"allowed_tags" text[] DEFAULT '{}' NOT NULL,
	"allowed_endpoint_ids" text[] DEFAULT '{}' NOT NULL,
	"certificate_id" uuid,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "serves_endpoint_port_unique" UNIQUE("endpoint_id","local_port"),
	CONSTRAINT "serves_protocol_check" CHECK ("serves"."protocol" IN ('https', 'tcp')),
	CONSTRAINT "serves_status_check" CHECK ("serves"."status" IN ('starting', 'active', 'error', 'stopped')),
	CONSTRAINT "serves_access_mode_check" CHECK ("serves"."access_mode" IN ('all_peers', 'tags', 'machines')),
	CONSTRAINT "serves_local_port_check" CHECK ("serves"."local_port" > 0 AND "serves"."local_port" <= 65535)
);
--> statement-breakpoint
CREATE TABLE "tunnels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"network_id" uuid NOT NULL,
	"endpoint_id" text NOT NULL,
	"relay_id" uuid,
	"local_port" integer NOT NULL,
	"protocol" text DEFAULT 'https' NOT NULL,
	"subdomain" text NOT NULL,
	"public_hostname" text NOT NULL,
	"status" text DEFAULT 'connecting' NOT NULL,
	"relay_auth_hash" text,
	"error_message" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tunnels_organization_subdomain_unique" UNIQUE("organization_id","subdomain"),
	CONSTRAINT "tunnels_protocol_check" CHECK ("tunnels"."protocol" IN ('https', 'tcp')),
	CONSTRAINT "tunnels_status_check" CHECK ("tunnels"."status" IN ('connecting', 'active', 'error', 'stopped', 'expired')),
	CONSTRAINT "tunnels_local_port_check" CHECK ("tunnels"."local_port" > 0 AND "tunnels"."local_port" <= 65535)
);
--> statement-breakpoint
ALTER TABLE "internal_certificates" ADD CONSTRAINT "internal_certificates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_certificates" ADD CONSTRAINT "internal_certificates_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_cas" ADD CONSTRAINT "organization_cas_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relay_registration_tokens" ADD CONSTRAINT "relay_registration_tokens_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relay_registration_tokens" ADD CONSTRAINT "relay_registration_tokens_relay_id_relays_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relay_registration_tokens" ADD CONSTRAINT "relay_registration_tokens_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relays" ADD CONSTRAINT "relays_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serves" ADD CONSTRAINT "serves_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serves" ADD CONSTRAINT "serves_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serves" ADD CONSTRAINT "serves_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serves" ADD CONSTRAINT "serves_certificate_id_internal_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."internal_certificates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tunnels" ADD CONSTRAINT "tunnels_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tunnels" ADD CONSTRAINT "tunnels_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tunnels" ADD CONSTRAINT "tunnels_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tunnels" ADD CONSTRAINT "tunnels_relay_id_relays_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "internal_certificates_by_organization_idx" ON "internal_certificates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "internal_certificates_by_endpoint_idx" ON "internal_certificates" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "relays_by_organization_idx" ON "relays" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "relays_by_organization_status_idx" ON "relays" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "serves_by_organization_idx" ON "serves" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "serves_by_network_idx" ON "serves" USING btree ("network_id");--> statement-breakpoint
CREATE INDEX "serves_by_endpoint_idx" ON "serves" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "serves_by_network_status_idx" ON "serves" USING btree ("network_id","status");--> statement-breakpoint
CREATE INDEX "tunnels_by_organization_idx" ON "tunnels" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tunnels_by_network_idx" ON "tunnels" USING btree ("network_id");--> statement-breakpoint
CREATE INDEX "tunnels_by_endpoint_idx" ON "tunnels" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "tunnels_by_relay_idx" ON "tunnels" USING btree ("relay_id");--> statement-breakpoint
CREATE INDEX "tunnels_by_status_idx" ON "tunnels" USING btree ("status");