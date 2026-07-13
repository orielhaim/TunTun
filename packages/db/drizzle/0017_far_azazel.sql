CREATE TABLE "device_code" (
	"id" text PRIMARY KEY NOT NULL,
	"device_code" text NOT NULL,
	"user_code" text NOT NULL,
	"user_id" text,
	"client_id" text,
	"scope" text,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_polled_at" timestamp with time zone,
	"polling_interval" integer
);
--> statement-breakpoint
CREATE INDEX "device_code_device_code_idx" ON "device_code" USING btree ("device_code");--> statement-breakpoint
CREATE INDEX "device_code_user_code_idx" ON "device_code" USING btree ("user_code");