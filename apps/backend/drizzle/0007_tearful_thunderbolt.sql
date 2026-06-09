CREATE TYPE "public"."workflow_run_status" AS ENUM('running', 'completed', 'error');--> statement-breakpoint
CREATE TYPE "public"."workflow_step_log_status" AS ENUM('running', 'success', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" "workflow_run_status" DEFAULT 'running' NOT NULL,
	"trigger_type" "agent_trigger_type" NOT NULL,
	"trigger_id" uuid,
	"trigger_payload" jsonb,
	"error" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "workflow_step_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"step_id" varchar(36) NOT NULL,
	"step_index" integer NOT NULL,
	"step_name" varchar(255) NOT NULL,
	"status" "workflow_step_log_status" DEFAULT 'running' NOT NULL,
	"input_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_data" jsonb,
	"error" text,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "agent_triggers" ADD COLUMN "workflow_id" uuid;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_step_logs" ADD CONSTRAINT "workflow_step_logs_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflows_agent_id_idx" ON "workflows" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "workflows_owner_id_idx" ON "workflows" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_workflow_id_idx" ON "workflow_runs" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_agent_id_idx" ON "workflow_runs" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_owner_id_idx" ON "workflow_runs" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_trigger_id_idx" ON "workflow_runs" USING btree ("trigger_id");--> statement-breakpoint
CREATE INDEX "workflow_step_logs_run_id_idx" ON "workflow_step_logs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "workflow_step_logs_step_id_idx" ON "workflow_step_logs" USING btree ("step_id");--> statement-breakpoint
ALTER TABLE "agent_triggers" ADD CONSTRAINT "agent_triggers_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_triggers_workflow_id_idx" ON "agent_triggers" USING btree ("workflow_id");