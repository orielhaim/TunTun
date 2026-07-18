CREATE TABLE "posture_attributes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"endpoint_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"namespace" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"collected_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"source" text DEFAULT 'agent' NOT NULL,
	CONSTRAINT "posture_attributes_endpoint_id_namespace_key_unique" UNIQUE("endpoint_id","namespace","key"),
	CONSTRAINT "posture_attributes_source_check" CHECK ("posture_attributes"."source" IN ('agent', 'control', 'api', 'integration'))
);
--> statement-breakpoint
CREATE TABLE "posture_definitions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"assertions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posture_definitions_organization_id_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "posture_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"endpoint_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"posture_definition_id" uuid NOT NULL,
	"passed" boolean NOT NULL,
	"failing_assertions" jsonb,
	"score" integer,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posture_integrations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"polling_interval_secs" integer DEFAULT 300 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posture_integrations_provider_check" CHECK ("posture_integrations"."provider" IN ('crowdstrike', 'sentinelone', 'intune', 'custom'))
);
--> statement-breakpoint
CREATE TABLE "posture_org_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'monitor' NOT NULL,
	"grace_period_minutes" integer DEFAULT 30 NOT NULL,
	"recheck_on_fail_seconds" integer DEFAULT 60 NOT NULL,
	"notify_user" boolean DEFAULT true NOT NULL,
	"notify_admin" boolean DEFAULT false NOT NULL,
	"auto_reauthorize" boolean DEFAULT true NOT NULL,
	"default_src_posture" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scoring_weights" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posture_org_settings_mode_check" CHECK ("posture_org_settings"."mode" IN ('monitor', 'warn', 'enforce'))
);
--> statement-breakpoint
CREATE TABLE "posture_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"url" text NOT NULL,
	"secret" text,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "policies" ADD COLUMN "src_posture" jsonb;--> statement-breakpoint
ALTER TABLE "posture_attributes" ADD CONSTRAINT "posture_attributes_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posture_attributes" ADD CONSTRAINT "posture_attributes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posture_definitions" ADD CONSTRAINT "posture_definitions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posture_evaluations" ADD CONSTRAINT "posture_evaluations_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posture_evaluations" ADD CONSTRAINT "posture_evaluations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posture_evaluations" ADD CONSTRAINT "posture_evaluations_posture_definition_id_posture_definitions_id_fk" FOREIGN KEY ("posture_definition_id") REFERENCES "public"."posture_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posture_integrations" ADD CONSTRAINT "posture_integrations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posture_org_settings" ADD CONSTRAINT "posture_org_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posture_webhooks" ADD CONSTRAINT "posture_webhooks_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posture_attributes_by_endpoint_idx" ON "posture_attributes" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "posture_attributes_by_org_idx" ON "posture_attributes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "posture_attributes_by_expires_idx" ON "posture_attributes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "posture_evaluations_by_endpoint_evaluated_idx" ON "posture_evaluations" USING btree ("endpoint_id","evaluated_at");--> statement-breakpoint
CREATE INDEX "posture_evaluations_by_org_idx" ON "posture_evaluations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "posture_integrations_by_org_idx" ON "posture_integrations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "posture_webhooks_by_org_idx" ON "posture_webhooks" USING btree ("organization_id");