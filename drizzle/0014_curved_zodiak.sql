CREATE TABLE "leave_policy" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"rules" jsonb NOT NULL,
	"revisions" jsonb NOT NULL,
	"covered_member_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_policy_kind_check" CHECK ("leave_policy"."kind" in ('annual','custom','closure')),
	CONSTRAINT "leave_policy_version_check" CHECK ("leave_policy"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "employee_leave" ADD COLUMN "policy_id" text;--> statement-breakpoint
ALTER TABLE "employee_leave" ADD COLUMN "policy_rules" jsonb;--> statement-breakpoint
ALTER TABLE "leave_policy" ADD CONSTRAINT "leave_policy_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_policy" ADD CONSTRAINT "leave_policy_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leave_policy_workspace_idx" ON "leave_policy" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leave_policy_name_unique" ON "leave_policy" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "leave_policy_annual_unique" ON "leave_policy" USING btree ("workspace_id") WHERE "leave_policy"."kind" = 'annual';