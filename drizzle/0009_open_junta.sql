CREATE TABLE "employee_allowance" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"member_id" text NOT NULL,
	"year" integer NOT NULL,
	"type" text NOT NULL,
	"half_days" integer NOT NULL,
	CONSTRAINT "allowance_positive" CHECK ("employee_allowance"."half_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "employee_attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"member_id" text NOT NULL,
	"clock_in" timestamp with time zone NOT NULL,
	"clock_out" timestamp with time zone,
	"late" boolean DEFAULT false NOT NULL,
	CONSTRAINT "attendance_duration_check" CHECK ("employee_attendance"."clock_out" is null or "employee_attendance"."clock_out" >= "employee_attendance"."clock_in")
);
--> statement-breakpoint
CREATE TABLE "employee_document" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"member_id" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"key" text,
	"url" text,
	"file_name" text,
	"mime" text,
	"size" integer,
	"visible_to_employee" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	CONSTRAINT "document_source_check" CHECK (("employee_document"."key" is not null and "employee_document"."url" is null) or ("employee_document"."key" is null and "employee_document"."url" is not null))
);
--> statement-breakpoint
CREATE TABLE "employee_leave" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"member_id" text NOT NULL,
	"type" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"half_days" integer NOT NULL,
	"duration" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"status" text NOT NULL,
	"rejection_reason" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attachment_id" text,
	CONSTRAINT "leave_dates_check" CHECK ("employee_leave"."end_date" >= "employee_leave"."start_date"),
	CONSTRAINT "leave_days_check" CHECK ("employee_leave"."half_days">0),
	CONSTRAINT "leave_status_check" CHECK ("employee_leave"."status" in ('pending','approved','rejected','cancelled'))
);
--> statement-breakpoint
ALTER TABLE "employee_record" ADD COLUMN "inactive_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "employee_record" ADD COLUMN "additional_contact" jsonb;--> statement-breakpoint
ALTER TABLE "employee_allowance" ADD CONSTRAINT "employee_allowance_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_allowance" ADD CONSTRAINT "employee_allowance_member_id_workspace_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."workspace_member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_attendance" ADD CONSTRAINT "employee_attendance_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_attendance" ADD CONSTRAINT "employee_attendance_member_id_workspace_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."workspace_member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_document" ADD CONSTRAINT "employee_document_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_document" ADD CONSTRAINT "employee_document_member_id_workspace_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."workspace_member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_document" ADD CONSTRAINT "employee_document_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_document" ADD CONSTRAINT "employee_document_deleted_by_auth_user_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_leave" ADD CONSTRAINT "employee_leave_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_leave" ADD CONSTRAINT "employee_leave_member_id_workspace_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."workspace_member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_leave" ADD CONSTRAINT "employee_leave_reviewed_by_auth_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_leave" ADD CONSTRAINT "employee_leave_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "allowance_member_year_type" ON "employee_allowance" USING btree ("workspace_id","member_id","year","type");--> statement-breakpoint
CREATE INDEX "attendance_member_idx" ON "employee_attendance" USING btree ("workspace_id","member_id","clock_in");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_open_unique" ON "employee_attendance" USING btree ("member_id") WHERE "employee_attendance"."clock_out" is null;--> statement-breakpoint
CREATE INDEX "document_member_idx" ON "employee_document" USING btree ("workspace_id","member_id");--> statement-breakpoint
CREATE INDEX "leave_member_idx" ON "employee_leave" USING btree ("workspace_id","member_id");--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rekann_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON employee_attendance, employee_allowance, employee_leave, employee_document TO rekann_runtime;
  END IF;
END $$;
