ALTER TABLE "devices" DROP CONSTRAINT "devices_type_check";--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_type_check" CHECK ("devices"."type" IN ('agent', 'sdk', 'k8s'));