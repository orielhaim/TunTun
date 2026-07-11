CREATE TABLE "hostname_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint_id" text NOT NULL,
	"network_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"is_wildcard" boolean DEFAULT false NOT NULL,
	"target_ip" "inet",
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hostname_routes_network_hostname_unique" UNIQUE("network_id","hostname","is_wildcard")
);
--> statement-breakpoint
ALTER TABLE "hostname_routes" ADD CONSTRAINT "hostname_routes_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostname_routes" ADD CONSTRAINT "hostname_routes_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hostname_routes_by_network_idx" ON "hostname_routes" USING btree ("network_id");--> statement-breakpoint
CREATE INDEX "hostname_routes_by_endpoint_idx" ON "hostname_routes" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "hostname_routes_by_network_enabled_idx" ON "hostname_routes" USING btree ("network_id","enabled");