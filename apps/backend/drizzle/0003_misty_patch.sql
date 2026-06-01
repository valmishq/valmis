CREATE TABLE "agent_skills" (
	"agent_id" uuid NOT NULL,
	"skill_name" varchar(255) NOT NULL,
	CONSTRAINT "agent_skills_agent_id_skill_name_pk" PRIMARY KEY("agent_id","skill_name")
);
--> statement-breakpoint
CREATE TABLE "agent_evolved_skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"skill_name" varchar(255) NOT NULL,
	"evolved_instructions" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_evolved_skills_agent_skill_unique" UNIQUE("agent_id","skill_name")
);
--> statement-breakpoint
CREATE TABLE "agent_execution_traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"skill_name" varchar(255) NOT NULL,
	"success" boolean NOT NULL,
	"tool_call_count" integer DEFAULT 0 NOT NULL,
	"execution_log" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_evolved_skills" ADD CONSTRAINT "agent_evolved_skills_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_execution_traces" ADD CONSTRAINT "agent_execution_traces_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_skills_agent_id_idx" ON "agent_skills" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_evolved_skills_agent_id_idx" ON "agent_evolved_skills" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_execution_traces_agent_id_idx" ON "agent_execution_traces" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_execution_traces_skill_name_idx" ON "agent_execution_traces" USING btree ("skill_name");