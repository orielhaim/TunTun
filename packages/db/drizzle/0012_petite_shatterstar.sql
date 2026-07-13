CREATE TABLE "ssh_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network_id" uuid NOT NULL,
	"src_selector" jsonb NOT NULL,
	"dst_selector" jsonb NOT NULL,
	"action" text NOT NULL,
	"users" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"record" boolean DEFAULT false NOT NULL,
	"recorder" jsonb,
	"enforce_recorder" boolean DEFAULT false NOT NULL,
	"check_period_secs" integer,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ssh_policies_action_check" CHECK ("ssh_policies"."action" IN ('accept', 'check', 'deny'))
);
--> statement-breakpoint
CREATE TABLE "ssh_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"network_id" uuid NOT NULL,
	"src_endpoint_id" text NOT NULL,
	"dst_endpoint_id" text NOT NULL,
	"src_hostname" text,
	"dst_hostname" text,
	"target_user" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"recorded" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_ms" integer,
	CONSTRAINT "ssh_sessions_status_check" CHECK ("ssh_sessions"."status" IN ('active', 'ended', 'killed'))
);
--> statement-breakpoint
ALTER TABLE "ssh_policies" ADD CONSTRAINT "ssh_policies_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_sessions" ADD CONSTRAINT "ssh_sessions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_sessions" ADD CONSTRAINT "ssh_sessions_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ssh_policies_by_network_idx" ON "ssh_policies" USING btree ("network_id");--> statement-breakpoint
CREATE INDEX "ssh_policies_by_network_priority_idx" ON "ssh_policies" USING btree ("network_id","priority");--> statement-breakpoint
CREATE INDEX "ssh_sessions_by_org_started_idx" ON "ssh_sessions" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE INDEX "ssh_sessions_by_network_started_idx" ON "ssh_sessions" USING btree ("network_id","started_at");--> statement-breakpoint
CREATE INDEX "ssh_sessions_by_dst_started_idx" ON "ssh_sessions" USING btree ("dst_endpoint_id","started_at");--> statement-breakpoint
CREATE INDEX "ssh_sessions_by_status_idx" ON "ssh_sessions" USING btree ("status");