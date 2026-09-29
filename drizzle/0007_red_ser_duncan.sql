CREATE TABLE "employee_record" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"created_by" text NOT NULL,
	"member_id" text,
	"invitation_id" text,
	"email" text NOT NULL,
	"employee_number" text NOT NULL,
	"status" text NOT NULL,
	"fields" jsonb NOT NULL,
	"avatar_key" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_record_status_check" CHECK ("employee_record"."status" in ('draft', 'ready'))
);
--> statement-breakpoint
ALTER TABLE "employee_record" ADD CONSTRAINT "employee_record_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_record" ADD CONSTRAINT "employee_record_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_record" ADD CONSTRAINT "employee_record_member_id_workspace_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."workspace_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_record" ADD CONSTRAINT "employee_record_invitation_id_workspace_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."workspace_invitation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employee_record_workspace_email_unique" ON "employee_record" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_record_workspace_number_unique" ON "employee_record" USING btree ("workspace_id","employee_number");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_record_member_unique" ON "employee_record" USING btree ("member_id");