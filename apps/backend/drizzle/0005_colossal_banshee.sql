CREATE TYPE "public"."memory_type" AS ENUM('episodic', 'semantic', 'procedural', 'working');--> statement-breakpoint
ALTER TABLE "agent_memory" ADD COLUMN "thread_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_memory" ADD COLUMN "memory_type" "memory_type" DEFAULT 'semantic' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_memory" ADD CONSTRAINT "agent_memory_thread_id_agent_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agent_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_memory_type_idx" ON "agent_memory" USING btree ("memory_type");--> statement-breakpoint
CREATE INDEX "agent_memory_thread_id_idx" ON "agent_memory" USING btree ("thread_id");