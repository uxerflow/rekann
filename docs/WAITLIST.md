# Waitlist implementation

Status: live at https://rekann.app on September 25, 2026, including Neon persistence, Resend segment/welcome delivery and signed unsubscribe synchronization. The owner enabled Full access on the Resend key; provisioning and live provider acceptance are complete.

## Live release

- Live comparison, fresh Chromium contexts with cache disabled and identical 1.6 Mbps / 150 ms throttling: first contentful paint improved from 3,636 ms to 2,524 ms; enabled signup from 4,089 ms to 2,799 ms. Initial resource transfer fell from 566,724 to 330,883 bytes. No motion/overlay chunk loaded before interaction; live update navigation passed. Plain-background frames, partial-preview frames and layout shift stayed zero. An additional unthrottled cold sample painted at 460 ms and enabled signup at 629 ms. These are diagnostic samples, not latency guarantees.

- First-paint payload reduction: waitlist CSS is now 49.92 kB gzip (previously 156.04 kB). The background is downsampled to 720×512 (7.4 KiB), while the critical font copies retain ASCII and general punctuation used by the English page; other UI characters fall back to the full existing Inter font. Source fonts remain unchanged. The dashboard uses a lossless WebP (60 KiB vs 135 KiB PNG); preview imagery has low fetch priority so it does not compete with the form stylesheet. Updates, dialogs and their motion library now load on interaction rather than holding up initial hydration. Hover/focus on Updates warms the module; submission starts loading confirmation code concurrently with the API request. Existing exit reversal, keyboard focus and reduced-motion behavior remain covered. Ten browser scenarios, typecheck and production build passed again.

- Cold-load rendering: the 920 KiB external background is replaced at runtime by a 7.4 KiB optimized copy embedded once in the initial stylesheet. Phase Grotesk WOFF2 and the existing Inter Latin 400/500 faces are embedded in that same stylesheet under a waitlist-specific family, eliminating late font swaps without changing auth fonts. The preview reserves its layout and reveals only after its three images decode; a failed decorative image is omitted, and a no-JavaScript fallback preserves the server-rendered preview. The form never waits for preview images. Ten browser scenarios, typecheck and the production build passed. A fresh browser context with cache disabled and simulated 1.6 Mbps / 150 ms latency recorded zero plain-background frames, zero partially loaded preview frames and zero layout shift on the local production build. The deployed site also returned HTTP 200 with no browser errors, zero plain-background/partial-preview frames and zero layout shift under the same cold-network simulation; the live Updates/detail/back flow passed.

- Signup focus fix: the email input, submit button and helper text stay stationary. Removed the form entrance and focus-dependent animation override that restarted the fade after blur. A regression test reproduced the replay before the fix and passes through typing, clearing, tabbing to the button and clicking outside the form. All eight browser scenarios and the waitlist production build passed.

- Motion polish: short staggered entrances for the hero and dashboard; reversible Updates panel enter/exit; shared modal exit timing including Back to updates; subtle success-icon reveal. Reduced motion disables spatial movement. Typecheck, production waitlist build and all eight browser scenarios passed, including rapid panel reversal, keyboard focus and reduced motion. Live Updates/detail/back/close behavior was checked after deployment.

- Owner authorized production migrations, Resend setup and deployment on September 25.
- Worker `rekann-waitlist`, version `ebca3c9c-bf9e-4325-90a5-6dff4d4b9c01`, uses `rekann.app/*` and `www.rekann.app/*` Worker Routes. Existing apex/www proxied DNS records remain in place; the Worker serves requests without fetching the parking origin. Cloudflare refused Custom Domains because of existing externally managed DNS records, and the local OAuth token cannot edit DNS. Do not remove these proxied records without first changing the Worker routing configuration.
- Neon production branch `br-purple-water-b3gx5d4v` was initially empty; tracked migrations 0000–0005 are applied. Development also has 0004–0005. Staging was not changed.
- `rekann_waitlist_runtime` has only schema usage/database connect and SELECT/INSERT/UPDATE on `waitlist_subscriber` and `auth_rate_limit`. Live checks confirm no SELECT access to auth users or workspaces.
- Database URL, independent auth/token signing secrets and the existing sending key are stored as Worker secrets. Ignored local secret files must never be committed.
- The Updates scrollbar is in the panel gutter, 6px outside cards. Email input now inherits the actual shared auth input border/focus styling, with an absolutely positioned icon rather than a separately styled wrapper. Computed border, radius, focus ring, white fill and left padding match auth; height remains 40px. Six browser scenarios passed again after this change.
- Live checks: root HTTPS 200, www 308 to the apex, correct favicon SVG/PNG/Apple icon and OG bytes, public robots policy, app/auth endpoints blocked, and existing preview sign-in still 200. Signup took 761ms and duplicate submission 314ms in one smoke sample. Consent and normalized email were persisted. Signed one-click unsubscribe, invalid-token rejection, non-mutating GET and repeat-subscription suppression passed.
- Resend segment **Rekann waitlist**: `57da4eaf-640f-40fc-b701-4b67a561e299`; webhook: `3be27613-1ebc-48aa-8565-e34b7369a8f1` at `/api/waitlist/webhook`. Contacts, segment and webhook secrets are installed in the public Worker.
- Live provider acceptance: a signup created the segment contact and exactly one welcome, reported **delivered** by Resend. A real Resend contact unsubscribe event reached the signed webhook and changed Neon. The link from a second actual test welcome unsubscribed Neon and Resend successfully. Cron execution completed without exceptions, pending jobs were drained, and all three synthetic test records are unsubscribed with `sync_pending=false`. No user inbox or broadcast campaign was messaged; Resend test-domain delivery is not a claim about Gmail/Outlook inbox placement.

## Approved design and behavior

- Figma file `jWSy3bCKjtKfyrToW5zyZ5`: waitlist `1024:60322`, two Updates `1047:56211`, final OG `989:109950`.
- Public URL: `https://rekann.app/`. `www.rekann.app` redirects to the canonical origin. No waitlist subdomain.
- App preview remains `https://preview-f3d09c858192da81b6d6.rekann.app` with its existing sign-in and workspace routing.
- Email-only signup, 40px white input and green submit button; one-step success, already subscribed, and a short preference-preserved message for a previously unsubscribed address. No verification step and no application account or onboarding creation.
- X profile: https://x.com/rekannapp.
- Exactly two update posts: September 25 dashboard design first, followed by the auth/onboarding start point. Scrollable feed, accessible modal details, original screenshot aspect ratios. Source frames: `1046:54838` and `1046:55351`.
- Original Figma images, texture, logo, ornaments and icons are exported under `public/waitlist`. The Phase Grotesk SemiBold font is the local design font; UI text uses existing Inter. `public/waitlist/background.webp` retains the lossless Figma reference. The production background is a 720×512 quality-95 WebP copy at `src/features/waitlist/background.webp`, embedded in the waitlist CSS.
- OG image is the final 1200×630 Figma export. Open Graph, Twitter large-image, canonical and preview noindex metadata are included.

## Data and email

`waitlist_subscriber` in Neon is the source of truth. It stores a unique normalized email, consent version/time, subscription status, and durable delivery state. It is independent of `auth_user` and workspace membership. Concurrent submissions deduplicate in PostgreSQL.

Resend stores a contact in a dedicated waitlist segment and sends a welcome email. The signup response never waits for Resend. A Worker background task and a one-minute Cron Trigger process pending records, with bounded provider requests and persistent exponential retry. A low-volume batch handles three records per invocation; inspect pending count and oldest pending timestamp before a high-volume campaign.

The welcome request uses a stable Resend idempotency key. Welcome retries stop before Resend's 24-hour deduplication window expires; a delayed welcome may be skipped while the subscription remains saved. Contacts continue syncing. Resend failure does not discard a saved signup. Monitor `sync_pending`, `sync_attempts`, `next_sync_at` and `synced_at`; provider response bodies and addresses are not logged.

Unsubscribe links carry purpose-bound HMAC signatures, not email addresses. Opening the link does not unsubscribe (mail scanners are safe). A deliberate confirmation POST changes the database immediately and queues Resend suppression. RFC 8058 one-click POST is also supported. Existing Resend unsubscribes, complaints and bounces are honored; duplicate submissions never reactivate them. A real resubscribe flow is intentionally outside this launch scope.

Resend Broadcasts must target the dedicated waitlist segment and include Resend's unsubscribe link. Signed `contact.updated`, `email.bounced`, `email.complained`, `email.suppressed`, and `suppression.added` webhooks mirror suppression into Neon. Repeated events are safe and subscription states only move toward suppression. No campaign emails are automatically sent by this release; only the signup welcome is queued.

Reference contracts: [Resend Contacts](https://resend.com/docs/api-reference/contacts/create-contact), [contact.updated](https://resend.com/docs/webhooks/contacts/updated), and [Svix signature verification](https://docs.svix.com/receiving/verifying-payloads/how-manual).

## Local preview and validation

Run the existing development server and open `/waitlist`. `SITE_MODE=app` preserves the original `/` workspace behavior. For the actual marketing root without changing app config:

```sh
CLOUDFLARE_ENV=waitlist corepack pnpm exec vite dev --host 127.0.0.1 --port 4311
```

No remote migrations or real email sends are performed by the new test suites. `tests/waitlist.unit.spec.ts` runs actual PostgreSQL queries in ephemeral PGlite and mocks email delivery; PGlite is development-only. `tests/waitlist.spec.ts` tests browser signup states with an intercepted API, all update flows, original image ratio, 40px controls, focus return, mobile overflow, unsubscribe confirmation, SSR metadata and HTTP origin boundaries.

Local backend signup migrations 0004–0005 are applied to the explicitly selected development branch. `.dev.vars` uses `WAITLIST_URL=http://127.0.0.1:4310` for local email links; start the local mailbox when testing welcome delivery.

## Release configuration

The `waitlist` Wrangler environment targets `rekann-waitlist` with Worker Routes for `rekann.app/*` and `www.rekann.app/*`, `SITE_MODE=waitlist`, a one-minute cron and no R2 binding. Its Worker blocks application/auth routes. The existing default production Worker and staging hostname are not retargeted. CI still deploys the default app environment, not the waitlist environment. Migration/runtime provisioning, public deployment, Resend provisioning and live delivery/unsubscribe acceptance are complete. The steps below document repeatable release configuration.

1. Verify Cloudflare profile/account and explicit Neon project/branch. Apply migrations `0004_known_longshot.sql` and `0005_waitlist_runtime_grants.sql` to the intended database; never reset an existing branch. The latter grants the existing app runtime role only the new table privileges.
2. For the public Worker, use a separate `rekann_waitlist_runtime` database role with `CONNECT`/schema `USAGE`, `SELECT, INSERT, UPDATE` on `waitlist_subscriber`, and `SELECT, INSERT, UPDATE` on `auth_rate_limit`. It needs no access to auth users, workspaces or R2. Give it its own production database URL. Provision credentials through ignored secret files or the secret store, never the terminal output.
3. Set Worker secrets `DATABASE_URL`, `BETTER_AUTH_SECRET` (required by the shared runtime; generate a separate value), `WAITLIST_TOKEN_SECRET` (separate stable random value of at least 32 characters), `RESEND_API_KEY`, `RESEND_CONTACTS_API_KEY` if the sending key lacks Contacts access, `RESEND_WAITLIST_SEGMENT_ID`, and `RESEND_WEBHOOK_SECRET`.
4. Create a dedicated **Rekann waitlist** segment in Resend. Add the signed webhook at `https://rekann.app/api/waitlist/webhook` for the events above. Do not create an automatic Broadcast.
5. Validate production `EMAIL_FROM` and verified sender domain `updates.rekann.app`. Production email links must use `WAITLIST_URL=https://rekann.app`.
6. Build explicitly with `CLOUDFLARE_ENV=waitlist corepack pnpm build`. Inspect `dist/server/wrangler.json` for Worker name, routes, cron, and bindings before deploying that generated config. Preserve existing proxied root/www DNS records for Worker Routes and all email/domain verification records.
7. For subsequent releases, verify contact/segment membership, welcome delivery and signed provider events using Resend's test recipients. Check pending sync jobs. Current live acceptance is recorded above; do not reset an existing unsubscribe during testing.

The owner has authorized this production release, including Resend provisioning. A staging deployment must also have migrations 0004–0005 and its own waitlist secrets/segment before enabling the added cron. Production subscriptions must never share the staging test segment.
