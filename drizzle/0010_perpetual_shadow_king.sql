CREATE TABLE "ai_settings" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"encrypted_key" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"allowed_roles" jsonb DEFAULT '["admin"]'::jsonb NOT NULL,
	"allow_writes" boolean DEFAULT false NOT NULL,
	"monthly_tokens" integer DEFAULT 100000 NOT NULL,
	"daily_requests" integer DEFAULT 30 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_turn" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"prompt" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"proposal" jsonb,
	"settings_version" integer NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"tokens" integer DEFAULT 16384 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_turn" ADD CONSTRAINT "ai_turn_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_turn" ADD CONSTRAINT "ai_turn_actor_id_auth_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_turn_usage_idx" ON "ai_turn" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_turn_actor_idx" ON "ai_turn" USING btree ("workspace_id","actor_id","created_at");
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rekann_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON ai_settings, ai_turn TO rekann_runtime;
  END IF;
END $$;
