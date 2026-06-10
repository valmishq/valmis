CREATE TYPE "public"."channel_thread_mode" AS ENUM('persistent', 'per_session');--> statement-breakpoint
CREATE TABLE "channel_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"external_id" text NOT NULL,
	"agent_id" uuid NOT NULL,
	"active_thread_id" uuid,
	"thread_mode" "channel_thread_mode" DEFAULT 'persistent' NOT NULL,
	"session_timeout_min" integer DEFAULT 60 NOT NULL,
	"notify_tool_usage" boolean DEFAULT false NOT NULL,
	"display_name" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "channel_links_channel_external_id_unique" UNIQUE("channel","external_id")
);
--> statement-breakpoint
CREATE TABLE "channel_pairing_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"channel" text NOT NULL,
	"agent_id" uuid NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_links" ADD CONSTRAINT "channel_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_links" ADD CONSTRAINT "channel_links_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_links" ADD CONSTRAINT "channel_links_active_thread_id_agent_threads_id_fk" FOREIGN KEY ("active_thread_id") REFERENCES "public"."agent_threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_pairing_codes" ADD CONSTRAINT "channel_pairing_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_pairing_codes" ADD CONSTRAINT "channel_pairing_codes_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "channel_links_user_id_idx" ON "channel_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "channel_links_agent_id_idx" ON "channel_links" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "channel_pairing_codes_user_id_idx" ON "channel_pairing_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "channel_pairing_codes_code_channel_idx" ON "channel_pairing_codes" USING btree ("code","channel");