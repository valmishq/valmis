CREATE TYPE "public"."chat_file_extraction_status" AS ENUM('pending', 'processing', 'ready', 'error', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."chat_file_kind" AS ENUM('image', 'document');--> statement-breakpoint
CREATE TYPE "public"."chat_file_source" AS ENUM('user_upload', 'agent_output');--> statement-breakpoint
CREATE TABLE "chat_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"message_id" uuid,
	"source" "chat_file_source" NOT NULL,
	"kind" "chat_file_kind" NOT NULL,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"extraction_status" "chat_file_extraction_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_files" ADD CONSTRAINT "chat_files_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_files" ADD CONSTRAINT "chat_files_thread_id_agent_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."agent_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_files" ADD CONSTRAINT "chat_files_message_id_agent_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."agent_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_files_thread_id_idx" ON "chat_files" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "chat_files_owner_id_idx" ON "chat_files" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "chat_files_message_id_idx" ON "chat_files" USING btree ("message_id");