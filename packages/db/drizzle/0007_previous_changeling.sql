CREATE TABLE "peer_metrics" (
	"network_id" uuid NOT NULL,
	"from_endpoint_id" text NOT NULL,
	"to_endpoint_id" text NOT NULL,
	"latency_ms" integer,
	"bytes_tx" bigint DEFAULT 0 NOT NULL,
	"bytes_rx" bigint DEFAULT 0 NOT NULL,
	"packet_loss_bps" integer,
	"direct" boolean,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "peer_metrics_network_id_from_endpoint_id_to_endpoint_id_pk" PRIMARY KEY("network_id","from_endpoint_id","to_endpoint_id")
);
--> statement-breakpoint
ALTER TABLE "peer_metrics" ADD CONSTRAINT "peer_metrics_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_metrics" ADD CONSTRAINT "peer_metrics_from_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("from_endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_metrics" ADD CONSTRAINT "peer_metrics_to_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("to_endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "peer_metrics_by_network_updated_idx" ON "peer_metrics" USING btree ("network_id","updated_at");