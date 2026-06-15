ALTER TABLE "workflows" ADD COLUMN "nodes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "edges" jsonb DEFAULT '[]'::jsonb NOT NULL;