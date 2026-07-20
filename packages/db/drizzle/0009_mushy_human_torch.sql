DROP TABLE "device_group_members" CASCADE;--> statement-breakpoint
DROP TABLE "device_groups" CASCADE;--> statement-breakpoint
DROP TABLE "user_group_members" CASCADE;--> statement-breakpoint
DROP TABLE "user_groups" CASCADE;--> statement-breakpoint
ALTER TABLE "enrollment_tokens" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;