CREATE TABLE "subnet_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint_id" text NOT NULL,
	"network_id" uuid NOT NULL,
	"cidr" "cidr" NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subnet_routes_network_cidr_unique" UNIQUE("network_id","cidr")
);
--> statement-breakpoint
ALTER TABLE "subnet_routes" ADD CONSTRAINT "subnet_routes_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subnet_routes" ADD CONSTRAINT "subnet_routes_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subnet_routes_by_network_idx" ON "subnet_routes" USING btree ("network_id");--> statement-breakpoint
CREATE INDEX "subnet_routes_by_endpoint_idx" ON "subnet_routes" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "subnet_routes_by_network_enabled_idx" ON "subnet_routes" USING btree ("network_id","enabled");