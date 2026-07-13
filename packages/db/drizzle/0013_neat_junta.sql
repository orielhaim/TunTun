CREATE TABLE "ssh_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"network_id" uuid NOT NULL,
	"recorder_endpoint_id" text NOT NULL,
	"cast_text" text NOT NULL,
	"content_sha256" text NOT NULL,
	"byte_size" integer NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ssh_recordings_session_unique" UNIQUE("session_id")
);
--> statement-breakpoint
ALTER TABLE "ssh_recordings" ADD CONSTRAINT "ssh_recordings_session_id_ssh_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ssh_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_recordings" ADD CONSTRAINT "ssh_recordings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_recordings" ADD CONSTRAINT "ssh_recordings_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ssh_recordings_by_session_idx" ON "ssh_recordings" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ssh_recordings_by_org_created_idx" ON "ssh_recordings" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "ssh_recordings_by_network_created_idx" ON "ssh_recordings" USING btree ("network_id","created_at");