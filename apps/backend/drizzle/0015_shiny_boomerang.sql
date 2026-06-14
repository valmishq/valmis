ALTER TYPE "public"."agent_trigger_type" ADD VALUE 'app';--> statement-breakpoint
ALTER TABLE "agent_triggers" ADD COLUMN "state" jsonb DEFAULT '{}'::jsonb NOT NULL;