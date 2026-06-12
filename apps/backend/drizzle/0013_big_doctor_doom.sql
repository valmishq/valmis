CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(64) NOT NULL,
	"description" text NOT NULL,
	"frontmatter" jsonb NOT NULL,
	"evolvable" boolean DEFAULT false NOT NULL,
	"source_url" text NOT NULL,
	"source_repo" varchar(255) NOT NULL,
	"source_ref" varchar(255),
	"source_subpath" text,
	"commit_sha" varchar(40) NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "skills_owner_name_unique" UNIQUE("owner_id","name")
);
--> statement-breakpoint
CREATE TABLE "skill_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_id" uuid NOT NULL,
	"path" text NOT NULL,
	"content" text NOT NULL,
	"size" integer NOT NULL,
	CONSTRAINT "skill_files_skill_path_unique" UNIQUE("skill_id","path")
);
--> statement-breakpoint
ALTER TABLE "agent_skills" ADD COLUMN "source" varchar(16) DEFAULT 'builtin' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_skills" ADD COLUMN "skill_id" uuid;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_files" ADD CONSTRAINT "skill_files_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "skills_owner_id_idx" ON "skills" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "skill_files_skill_id_idx" ON "skill_files" USING btree ("skill_id");--> statement-breakpoint
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;