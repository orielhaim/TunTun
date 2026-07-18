ALTER TABLE "posture_definitions" DROP CONSTRAINT "posture_definitions_organization_id_name_unique";--> statement-breakpoint
ALTER TABLE "posture_org_settings" DROP CONSTRAINT "posture_org_settings_pkey";--> statement-breakpoint
ALTER TABLE "networks" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "posture_definitions" ADD COLUMN "network_id" uuid;--> statement-breakpoint
ALTER TABLE "posture_org_settings" ADD COLUMN "id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL;--> statement-breakpoint
ALTER TABLE "posture_org_settings" ADD COLUMN "network_id" uuid;--> statement-breakpoint
ALTER TABLE "posture_definitions" ADD CONSTRAINT "posture_definitions_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posture_org_settings" ADD CONSTRAINT "posture_org_settings_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "posture_definitions_org_name_uidx" ON "posture_definitions" USING btree ("organization_id","name") WHERE "posture_definitions"."network_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "posture_definitions_network_name_uidx" ON "posture_definitions" USING btree ("organization_id","network_id","name") WHERE "posture_definitions"."network_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "posture_definitions_by_network_idx" ON "posture_definitions" USING btree ("network_id");--> statement-breakpoint
CREATE UNIQUE INDEX "posture_org_settings_org_default_uidx" ON "posture_org_settings" USING btree ("organization_id") WHERE "posture_org_settings"."network_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "posture_org_settings_network_uidx" ON "posture_org_settings" USING btree ("organization_id","network_id") WHERE "posture_org_settings"."network_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "posture_org_settings_by_network_idx" ON "posture_org_settings" USING btree ("network_id");