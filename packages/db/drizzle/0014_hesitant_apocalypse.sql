CREATE TABLE "organization_oidc_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"issuer_url" text,
	"client_id" text,
	"client_secret" text,
	"discovery_url" text,
	"scopes" text DEFAULT 'openid profile email' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ssh_auth_challenges" (
	"token" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"network_id" uuid NOT NULL,
	"endpoint_id" text NOT NULL,
	"dst_endpoint_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"proof_token" text,
	"proof_expires_at" timestamp with time zone,
	"proof_consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ssh_auth_challenges_status_check" CHECK ("ssh_auth_challenges"."status" IN ('pending', 'completed', 'expired', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "ssh_auth_checks" (
	"endpoint_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"authenticated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"method" text DEFAULT 'oidc' NOT NULL,
	"identity_email" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ssh_auth_checks_method_check" CHECK ("ssh_auth_checks"."method" IN ('oidc', 'session', 'saml'))
);
--> statement-breakpoint
ALTER TABLE "organization_oidc_settings" ADD CONSTRAINT "organization_oidc_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_auth_challenges" ADD CONSTRAINT "ssh_auth_challenges_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_auth_challenges" ADD CONSTRAINT "ssh_auth_challenges_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_auth_checks" ADD CONSTRAINT "ssh_auth_checks_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ssh_auth_challenges_by_endpoint_idx" ON "ssh_auth_challenges" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "ssh_auth_challenges_by_proof_idx" ON "ssh_auth_challenges" USING btree ("proof_token");--> statement-breakpoint
CREATE INDEX "ssh_auth_checks_by_org_idx" ON "ssh_auth_checks" USING btree ("organization_id");