CREATE TABLE "serve_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serve_id" uuid NOT NULL,
	"peer_endpoint_id" text NOT NULL,
	"peer_hostname" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"bytes_in" bigint DEFAULT 0 NOT NULL,
	"bytes_out" bigint DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "serve_sessions_serve_peer_unique" UNIQUE("serve_id","peer_endpoint_id")
);
--> statement-breakpoint
ALTER TABLE "serve_sessions" ADD CONSTRAINT "serve_sessions_serve_id_serves_id_fk" FOREIGN KEY ("serve_id") REFERENCES "public"."serves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "serve_sessions_by_serve_idx" ON "serve_sessions" USING btree ("serve_id");--> statement-breakpoint
CREATE INDEX "serve_sessions_by_serve_last_seen_idx" ON "serve_sessions" USING btree ("serve_id","last_seen_at");