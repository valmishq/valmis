CREATE TABLE "credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(128) NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "credentials_owner_id_idx" ON "credentials" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "credentials_type_idx" ON "credentials" USING btree ("type");