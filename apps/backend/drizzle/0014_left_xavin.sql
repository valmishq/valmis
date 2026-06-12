CREATE TYPE "public"."knowledge_file_status" AS ENUM('pending', 'processing', 'ready', 'error');--> statement-breakpoint
CREATE TYPE "public"."knowledge_source_type" AS ENUM('upload', 'cloud');--> statement-breakpoint
CREATE TABLE "knowledge_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source_type" "knowledge_source_type" NOT NULL,
	"provider" text,
	"credential_id" uuid,
	"external_id" text,
	"external_path" text,
	"mime_type" text,
	"size_bytes" integer,
	"status" "knowledge_file_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"extracted_segments" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_knowledge_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"knowledge_file_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" "knowledge_file_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_knowledge_files_agent_file_unique" UNIQUE("agent_id","knowledge_file_id")
);
--> statement-breakpoint
ALTER TABLE "agent_memory" ADD COLUMN "is_knowledge_base" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_memory" ADD COLUMN "agent_knowledge_file_id" uuid;--> statement-breakpoint
ALTER TABLE "knowledge_files" ADD CONSTRAINT "knowledge_files_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_files" ADD CONSTRAINT "knowledge_files_credential_id_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_knowledge_files" ADD CONSTRAINT "agent_knowledge_files_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_knowledge_files" ADD CONSTRAINT "agent_knowledge_files_knowledge_file_id_knowledge_files_id_fk" FOREIGN KEY ("knowledge_file_id") REFERENCES "public"."knowledge_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_files_owner_id_idx" ON "knowledge_files" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "knowledge_files_status_idx" ON "knowledge_files" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_knowledge_files_agent_id_idx" ON "agent_knowledge_files" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_knowledge_files_file_id_idx" ON "agent_knowledge_files" USING btree ("knowledge_file_id");--> statement-breakpoint
CREATE INDEX "agent_knowledge_files_owner_id_idx" ON "agent_knowledge_files" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "agent_memory" ADD CONSTRAINT "agent_memory_agent_knowledge_file_id_agent_knowledge_files_id_fk" FOREIGN KEY ("agent_knowledge_file_id") REFERENCES "public"."agent_knowledge_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_memory_agent_knowledge_file_id_idx" ON "agent_memory" USING btree ("agent_knowledge_file_id");