CREATE TABLE "waitlist_subscriber" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'subscribed' NOT NULL,
	"consent_version" text DEFAULT 'waitlist-2026-09' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"sync_pending" boolean DEFAULT true NOT NULL,
	"sync_attempts" integer DEFAULT 0 NOT NULL,
	"next_sync_at" timestamp with time zone DEFAULT now() NOT NULL,
	"synced_at" timestamp with time zone,
	"welcome_sent_at" timestamp with time zone,
	CONSTRAINT "waitlist_subscriber_email_unique" UNIQUE("email"),
	CONSTRAINT "waitlist_status_check" CHECK ("waitlist_subscriber"."status" in ('subscribed', 'unsubscribed', 'suppressed')),
	CONSTRAINT "waitlist_email_normalized" CHECK ("waitlist_subscriber"."email" = lower(trim("waitlist_subscriber"."email")))
);
--> statement-breakpoint
CREATE INDEX "waitlist_pending_idx" ON "waitlist_subscriber" USING btree ("next_sync_at") WHERE "waitlist_subscriber"."sync_pending" = true;