CREATE TABLE "ai_budget" (
	"id" text PRIMARY KEY NOT NULL,
	"period" text NOT NULL,
	"tokens" integer DEFAULT 0 NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "funding" text DEFAULT 'workspace' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_turn" ADD COLUMN "funding" text DEFAULT 'workspace' NOT NULL;--> statement-breakpoint
CREATE INDEX "ai_budget_retention_idx" ON "ai_budget" USING btree ("period");
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rekann_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ai_budget TO rekann_runtime;
  END IF;
END $$;
