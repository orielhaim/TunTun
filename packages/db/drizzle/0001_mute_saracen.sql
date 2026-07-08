ALTER TABLE "api_keys" ADD COLUMN "secret_prefix" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "type" text DEFAULT 'agent' NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_type_check" CHECK ("devices"."type" IN ('agent', 'sdk'));