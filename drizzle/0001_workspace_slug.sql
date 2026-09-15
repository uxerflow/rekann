ALTER TABLE "workspace" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_slug_unique" UNIQUE("slug");