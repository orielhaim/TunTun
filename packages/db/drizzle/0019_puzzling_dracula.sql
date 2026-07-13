CREATE TABLE "endpoint_send_settings" (
	"endpoint_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"consent_mode" text DEFAULT 'auto_accept' NOT NULL,
	"inbox_path" text,
	"pin_blobs" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "endpoint_send_settings_consent_check" CHECK ("endpoint_send_settings"."consent_mode" IN ('auto_accept', 'prompt', 'deny'))
);
--> statement-breakpoint
CREATE TABLE "file_transfers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"network_id" uuid NOT NULL,
	"sender_endpoint_id" text NOT NULL,
	"receiver_endpoint_id" text,
	"file_name" text NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"blake3_hash" text NOT NULL,
	"status" text DEFAULT 'offered' NOT NULL,
	"progress_pct" integer DEFAULT 0 NOT NULL,
	"bytes_transferred" bigint DEFAULT 0 NOT NULL,
	"error" text,
	"message" text,
	"inbox_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "file_transfers_status_check" CHECK ("file_transfers"."status" IN ('offered', 'pending', 'transferring', 'completed', 'failed', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "endpoint_send_settings" ADD CONSTRAINT "endpoint_send_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_transfers" ADD CONSTRAINT "file_transfers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_transfers" ADD CONSTRAINT "file_transfers_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "endpoint_send_settings_by_org_idx" ON "endpoint_send_settings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "file_transfers_by_org_created_idx" ON "file_transfers" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "file_transfers_by_network_created_idx" ON "file_transfers" USING btree ("network_id","created_at");--> statement-breakpoint
CREATE INDEX "file_transfers_by_status_idx" ON "file_transfers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "file_transfers_by_sender_idx" ON "file_transfers" USING btree ("sender_endpoint_id");--> statement-breakpoint
CREATE INDEX "file_transfers_by_receiver_idx" ON "file_transfers" USING btree ("receiver_endpoint_id");