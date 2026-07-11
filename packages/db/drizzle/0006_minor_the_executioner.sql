CREATE TABLE "node_group_members" (
	"group_id" uuid NOT NULL,
	"endpoint_id" text NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "node_group_members_group_id_endpoint_id_pk" PRIMARY KEY("group_id","endpoint_id")
);
--> statement-breakpoint
CREATE TABLE "node_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network_id" uuid NOT NULL,
	"name" text NOT NULL,
	"ha_enabled" boolean DEFAULT true NOT NULL,
	"active_endpoint_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "node_groups_network_name_unique" UNIQUE("network_id","name")
);
--> statement-breakpoint
ALTER TABLE "node_group_members" ADD CONSTRAINT "node_group_members_group_id_node_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."node_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_group_members" ADD CONSTRAINT "node_group_members_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_groups" ADD CONSTRAINT "node_groups_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_groups" ADD CONSTRAINT "node_groups_active_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("active_endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "node_group_members_by_endpoint_idx" ON "node_group_members" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "node_groups_by_network_idx" ON "node_groups" USING btree ("network_id");