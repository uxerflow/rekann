ALTER TABLE "workspace_member" ADD COLUMN "employee_number" text;--> statement-breakpoint
ALTER TABLE "workspace_member" ADD COLUMN "department" text;--> statement-breakpoint
ALTER TABLE "workspace_member" ADD COLUMN "employment_type" text;--> statement-breakpoint
ALTER TABLE "workspace_member" ADD COLUMN "start_date" date;--> statement-breakpoint
CREATE UNIQUE INDEX "employee_number_workspace_unique" ON "workspace_member" USING btree ("workspace_id","employee_number");--> statement-breakpoint
ALTER TABLE "workspace_member" ADD CONSTRAINT "employment_type_check" CHECK ("workspace_member"."employment_type" in ('Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance'));