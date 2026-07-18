CREATE TABLE "auto_approvers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"network_id" uuid,
	"slug" text NOT NULL,
	"routes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"exit_nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auto_approvers_organization_id_slug_unique" UNIQUE("organization_id","slug")
);
--> statement-breakpoint
CREATE TABLE "device_group_members" (
	"group_id" uuid NOT NULL,
	"endpoint_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_group_members_group_id_endpoint_id_pk" PRIMARY KEY("group_id","endpoint_id")
);
--> statement-breakpoint
CREATE TABLE "device_groups" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"network_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_groups_organization_id_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "grants" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"network_id" uuid,
	"slug" text NOT NULL,
	"description" text,
	"src_selectors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dst_selectors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ip_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"app_capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grants_organization_id_slug_unique" UNIQUE("organization_id","slug")
);
--> statement-breakpoint
CREATE TABLE "host_aliases" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"target" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "host_aliases_organization_id_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "ip_sets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"entries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ip_sets_organization_id_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "node_attributes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"endpoint_id" text,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_revisions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"network_id" uuid,
	"version" bigint NOT NULL,
	"content_hash" text NOT NULL,
	"ir_snapshot" jsonb,
	"source" text NOT NULL,
	"author_user_id" text,
	"author_api_key_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policy_revisions_source_check" CHECK ("policy_revisions"."source" IN ('dashboard', 'api', 'gitops', 'terraform'))
);
--> statement-breakpoint
CREATE TABLE "tag_definitions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"owners" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tag_definitions_organization_id_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "user_group_members" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" text,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_group_members_identity_check" CHECK ("user_group_members"."user_id" IS NOT NULL OR "user_group_members"."email" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "user_groups" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_groups_organization_id_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
ALTER TABLE "policies" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "auto_approvers" ADD CONSTRAINT "auto_approvers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_approvers" ADD CONSTRAINT "auto_approvers_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_group_members" ADD CONSTRAINT "device_group_members_group_id_device_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."device_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_group_members" ADD CONSTRAINT "device_group_members_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_groups" ADD CONSTRAINT "device_groups_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_groups" ADD CONSTRAINT "device_groups_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_aliases" ADD CONSTRAINT "host_aliases_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ip_sets" ADD CONSTRAINT "ip_sets_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_attributes" ADD CONSTRAINT "node_attributes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_attributes" ADD CONSTRAINT "node_attributes_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_revisions" ADD CONSTRAINT "policy_revisions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_revisions" ADD CONSTRAINT "policy_revisions_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_definitions" ADD CONSTRAINT "tag_definitions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_group_members" ADD CONSTRAINT "user_group_members_group_id_user_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."user_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_group_members" ADD CONSTRAINT "user_group_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auto_approvers_by_org_idx" ON "auto_approvers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "device_group_members_by_endpoint_idx" ON "device_group_members" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "device_groups_by_org_idx" ON "device_groups" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "device_groups_by_network_idx" ON "device_groups" USING btree ("network_id");--> statement-breakpoint
CREATE INDEX "grants_by_org_idx" ON "grants" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "grants_by_network_idx" ON "grants" USING btree ("network_id");--> statement-breakpoint
CREATE INDEX "host_aliases_by_org_idx" ON "host_aliases" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ip_sets_by_org_idx" ON "ip_sets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "node_attributes_by_org_idx" ON "node_attributes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "node_attributes_by_endpoint_idx" ON "node_attributes" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "policy_revisions_by_org_created_idx" ON "policy_revisions" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "tag_definitions_by_org_idx" ON "tag_definitions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "user_group_members_by_group_idx" ON "user_group_members" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "user_group_members_by_user_idx" ON "user_group_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_group_members_group_user_uidx" ON "user_group_members" USING btree ("group_id","user_id") WHERE "user_group_members"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "user_group_members_group_email_uidx" ON "user_group_members" USING btree ("group_id","email") WHERE "user_group_members"."email" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "user_groups_by_org_idx" ON "user_groups" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "policies_org_slug_unique" ON "policies" USING btree ("organization_id","slug") WHERE "policies"."slug" IS NOT NULL;