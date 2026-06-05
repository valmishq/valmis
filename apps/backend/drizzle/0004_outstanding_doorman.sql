CREATE TYPE "public"."agent_thread_status" AS ENUM('idle', 'running', 'completed', 'error');--> statement-breakpoint
CREATE TYPE "public"."agent_trigger_type" AS ENUM('chat', 'cron', 'webhook', 'manual');--> statement-breakpoint
CREATE TYPE "public"."agent_message_role" AS ENUM('user', 'assistant', 'tool_result');--> statement-breakpoint
CREATE TABLE "agent_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text,
	"status" "agent_thread_status" DEFAULT 'idle' NOT NULL,
	"trigger_type" "agent_trigger_type" DEFAULT 'chat' NOT NULL,
	"trigger_id" uuid,
	"trigger_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" "agent_message_role" NOT NULL,
	"content" jsonb NOT NULL,
	"tool_call_id" varchar(255),
	"tool_name" varchar(255),
	"token_usage" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_triggers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" "agent_trigger_type" NOT NULL,
	"name" varchar(255) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"last_fired_at" timestamp,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_threads" ADD CONSTRAINT "agent_threads_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_thread_id_agent_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agent_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_triggers" ADD CONSTRAINT "agent_triggers_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_threads_agent_id_idx" ON "agent_threads" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_threads_owner_id_idx" ON "agent_threads" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "agent_threads_trigger_id_idx" ON "agent_threads" USING btree ("trigger_id");--> statement-breakpoint
CREATE INDEX "agent_messages_thread_id_idx" ON "agent_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "agent_messages_thread_created_idx" ON "agent_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_triggers_agent_id_idx" ON "agent_triggers" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_triggers_owner_id_idx" ON "agent_triggers" USING btree ("owner_id");