CREATE TABLE "device_profiles" (
	"endpoint_id" text PRIMARY KEY NOT NULL,
	"network_id" uuid NOT NULL,
	"exit_node_endpoint_id" text,
	"split_tunnel_mode" text DEFAULT 'exclude' NOT NULL,
	"split_tunnel_cidrs" "cidr"[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_profiles_split_tunnel_mode_check" CHECK ("device_profiles"."split_tunnel_mode" IN ('include', 'exclude'))
);
--> statement-breakpoint
CREATE TABLE "exit_node_config" (
	"endpoint_id" text PRIMARY KEY NOT NULL,
	"network_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"allowed_cidrs" "cidr"[] DEFAULT '{"0.0.0.0/0"}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_profiles" ADD CONSTRAINT "device_profiles_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_profiles" ADD CONSTRAINT "device_profiles_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_profiles" ADD CONSTRAINT "device_profiles_exit_node_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("exit_node_endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exit_node_config" ADD CONSTRAINT "exit_node_config_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exit_node_config" ADD CONSTRAINT "exit_node_config_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_profiles_by_network_idx" ON "device_profiles" USING btree ("network_id");--> statement-breakpoint
CREATE INDEX "exit_node_config_by_network_idx" ON "exit_node_config" USING btree ("network_id");--> statement-breakpoint
CREATE INDEX "exit_node_config_by_network_enabled_idx" ON "exit_node_config" USING btree ("network_id","enabled");