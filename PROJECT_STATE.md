# Project State

Updated: September 29, 2026.

## Admin Leaves preview release, September 29

The approved Admin Leaves flow is implemented and deployed at `https://preview-f3d09c858192da81b6d6.rekann.app`. Application baseline `f02794b` plus the mobile-filter spacing fix is on `feat/admin-leaves`; draft PR #13 targets `feat/auth-workspace` (#9) so the review shows the Leaves delta. Nothing was merged to `main`. Active staging Worker version: `8f9d87ab-d217-4048-9971-575cb949911e`.

The release includes Week, Month and Year calendars, admin employee selection and time-off recording, approval/rejection/cancellation, annual/custom policies, company closures, balance rules, and loading/empty/error/retry states. Existing employee self-service remains in Employee Detail. See `docs/LEAVES.md` for permissions, period behavior, closure coverage and the boundary between saved payment terms and payroll execution.

Frozen install, formatting of changed source, TypeScript, staging build and all 51 unit tests passed. The 11 Leaves unit tests were repeated after the final validation changes. Browser flows passed for Leaves, Employee Detail and shared dropdowns; Leaves covers network retry, preserved inputs, desktop/mobile overflow, keyboard behavior, dirty-form discard and duplicate employee names. The dropdown regression test was updated for the existing generic no-options copy and run with the local mailbox; original local email configuration was restored. Graphify was updated.

Migrations 0014–0015 were applied to the explicitly verified development and staging branches. Live staging checks passed sign-in, anonymous denial, employee/admin separation, approval retry, closure refunds, browser recording and persistence after refresh, with no browser exceptions or mobile overflow. Temporary staging identities/workspace were removed; the baseline remains 11 users and one workspace. Production waitlist remains `ebca3c9c-bf9e-4325-90a5-6dff4d4b9c01`. Owner visual acceptance is next; automated checks are not a claim of pixel-perfect identity on every viewport.

## Preview staging AI release, September 29

Owner-authorized push and staging deployment are complete. The feature branch is pushed to GitHub without merging `main`. Preview `https://preview-f3d09c858192da81b6d6.rekann.app` now serves Worker version `4adc9c7a-a230-40a0-b213-4cd2fc7eb96a`, built from application/configuration commit `f59c2d6`. Migrations through 0013, an isolated encryption secret, the Cloudflare AI binding and the explicit staging budget allocation are in place.

Live sign-in, included AI in English and Indonesian, anonymous-access denial, memory save/clear, model menu, mobile layout and Assistant drawer passed. Temporary test data was removed; 11 existing users and one workspace remain. Production waitlist deployment history is unchanged. See `docs/STAGING.md` for evidence and remaining acceptance limits. The local-checkpoint and September 27 notes below are historical.

## Local Git checkpoint, September 29

The owner authorized local commit cleanup before Leave and Attendance work. The existing dashboard, Team Directory, employee management, waitlist and staging setup are recorded first; AI integration and migrations 0010–0013 follow in a separate commit. Shared dropdown and scroll-area foundations are included in the baseline so both commits are self-contained. Existing application behavior is preserved; exported SVG changes only trim trailing blank lines.

The baseline was materialized separately and passed TypeScript and a staging-targeted build without AI integration. The complete working tree passed frozen dependency installation, TypeScript, a staging-targeted build and all 40 unit tests. Focused browser verification passed employee creation, AI settings and confirmed actions, and the directory. The first Employee Detail run failed after an unexpected navigation during document Undo; a separate rerun passed the complete flow without a code change. The initial navigation cause remains unconfirmed. Live account-backed model inference is an opt-in check and was skipped for this Git cleanup.

No push, merge, remote migration or deployment is part of this checkpoint. Staging remains on the September 27 version, and the public waitlist at `rekann.app` is unchanged. The outstanding AI staging requirements remain listed in `docs/AI_ASSISTANT.md`.

## Rekann AI development, September 27

The owner authorized a first end-to-end AI slice for Team Directory read/write, followed by private memory and explicit storage/token limits. Implemented locally at `/w/:slug/ai` and the Assistant panel, with workspace-admin OpenRouter settings, permission-aware search/count, employee drafts, limited work edits, explicit confirmation, idempotent commits, audit, quotas and encrypted provider keys. Private notes and recent-message context are scoped to both workspace and authenticated user; other admins cannot read them. See `docs/AI_ASSISTANT.md` for boundaries, retention and release setup.

Development migrations 0010–0013 are applied. Included Rekann AI now defaults on for workspaces without saved settings when the central provider is configured, with read-only access for active roles. Its backend allowance decreases at 100, 200 and 1,000 verified active members, while a 1,000,000-token shared monthly ceiling stays fixed. Population tiers and shared pool totals remain hidden. The model menu now shows the current personal daily allowance and UTC reset, plus the Figma OWN AI PROVIDER section linking admins to connection settings. Shared dropdowns show a scrollbar only on overflow and reserve a separate gutter so it cannot cover content or checkmarks. See docs/AI_ASSISTANT.md. Settings use collapsed advanced controls, grouped numbers and dialog scroll gutters. Workspace OpenRouter keys remain a separate explicit option with no automatic fallback. Aggregate usage survives forgetting and workspace deletion; private memory remains isolated. Typecheck/build, focused AI tests and the authenticated browser flow passed. Live included Cloudflare inference is verified without a workspace key; workspace OpenRouter live inference remains pending. Included AI uses a Cloudflare Workers AI binding, enabled in dev with no OpenRouter key, plus a 65,536-token shared daily cap. Staging requires its own binding and allocated budget before activation. Staging and the production waitlist are unchanged. Standard automated integration checks mock inference; an opt-in real Cloudflare smoke test validates the included connection. Broader live interpretation acceptance is still required before release.

## Current status

Auth & Workspace and the dashboard UI are deployed to https://preview-f3d09c858192da81b6d6.rekann.app. The current local branch is `feat/admin-leaves`, based on `feat/auth-workspace`. Admin Leaves is now also on preview staging. Existing application work and AI are recorded in separate commits and pushed as of September 29. AI is deployed to preview staging; the feature branch has not been merged into main. The waitlist is live at https://rekann.app with production database persistence. Resend Contacts, the dedicated waitlist segment, welcome delivery and signed unsubscribe synchronization are configured and tested live.

Notion remains the canonical product source. Follow the owner's approved Figma designs and implement in small phases. Team Directory phase one is implemented locally following the September 26 design review. Add Employee was authorized on September 27 and is implemented in development with three steps, saved drafts and invitation handling. Employee Detail is now implemented and deployed to staging: profile/work/personal edits, account access and reactivation, persisted attendance, leave requests/allowances/reviews and private documents with Undo. See docs/TEAM_DIRECTORY.md for permissions, policy boundaries and verification; this work was deployed to staging on September 27; production remains the waitlist.

## Implemented

- Email/password signup and sign-in, six-digit verification, password reset, sessions, and sign-out. Google OAuth remains disabled.
- Company/profile onboarding, private company logos and profile images, create/join/switch workspaces, invitations, basic Team, and Roles & access.
- Workspace-scoped Admin, optional Manager / HR with delegated permissions, and Employee. Protected operations enforce membership and permissions on the server.
- Stable, unique workspace URLs under `/w/:slug`. Legacy UUID links redirect after authorization; collisions receive numeric suffixes.
- Creator onboarding has two steps: company details and profile. Back preserves entered data; primary actions require valid required fields. Invited employees retain their separate profile/details flow.
- Completed onboarding redirects to the workspace, including legacy profile URLs. The generic company URL resumes the existing workspace flow. Another workspace requires the explicit Create a workspace action (`?newWorkspace=true`). The server rejects company onboarding changes after completion; normal profile editing remains available.
- Updated Rekann branding and favicon SVG/PNG plus Apple touch icon exported from Figma node `387:12176`.
- Shared motion, scrollbars, focus, reduced-motion behavior, field limits, and overflow protections are documented in `docs/DESIGN_SYSTEM.md`.

## Dashboard and remaining feature boundaries

The dashboard shell, welcome card, setup checklist, widget layouts, responsive presentation, and Assistant UI exist. This is not a complete live HR backend:

- Dashboard metrics and preview states use sample values rather than attendance, time-off, and approval data.
- Setup completion is not fully connected to saved company settings and leave policies.
- Quick notes/checklists use browser local storage rather than server persistence.
- The Assistant now uses the Team Directory AI service in local development. The previous simulation is retained only behind the explicit development `assistantPreview` query. Live provider acceptance is pending; attachments and other HR modules remain unavailable.
- The local Team Directory now has live workspace-scoped list/grid browsing, search, combined department/type filters, sort, pagination, personal browser-local pins, and loading/empty/error recovery states. Nullable employment fields use migration 0006. Existing invitation/access management is preserved in Settings → Team access. Add Employee and its saved-record/invitation screens use migrations 0007–0008; Employee Detail uses migration 0009. These migrations are applied to both development and staging.

## Staging resources

- Cloudflare account: Rekann (`f0f101bf2b8415c34b2a1589e4017295`), Wrangler profile `rekann`.
- Worker: `rekann-staging`; custom domain: `preview-f3d09c858192da81b6d6.rekann.app`; private R2 bucket: `rekann-staging-media`.
- Neon project: `bold-flower-53962598`, Singapore; staging branch: `br-nameless-salad-b3p61oq1`. Tracked migrations were applied to an initially empty branch; staging now may contain owner test accounts and must not be reset.
- Restricted runtime role: `rekann_runtime`. Development and staging use separate database branches. The local `.neon` context still targets production; specify the intended branch explicitly.
- Resend domain `updates.rekann.app` is verified. Sender: `Rekann <noreply@updates.rekann.app>`.
- Database, auth, and email credentials are Worker secrets, with ignored local configuration. Never print or commit credentials.
- Staging is internet-accessible, with authenticated application data. Use test data. Build with `CLOUDFLARE_ENV=staging`; see `docs/STAGING.md` for deployment instructions.
- Latest verified deployment: `8f9d87ab-d217-4048-9971-575cb949911e` on September 29, 2026. Admin Leaves is included alongside AI, Team Directory and Employee Detail; migrations through 0015 are applied. Live authenticated staging checks passed and temporary test data was cleaned up.

## Verification and limits

Latest staging work passed typecheck, build, and the targeted workspace URL/onboarding browser test. It covers completed-onboarding redirects, forbidden company onboarding updates after completion, explicit creation of another workspace, legacy links, and normal profile editing. The test used the local mailbox and development database.

Staging smoke checks verified HTTPS auth pages, unauthenticated session/API behavior, and a database-backed invitation lookup. Desktop/mobile auth page checks found no JavaScript errors or horizontal overflow. All three deployed favicon assets returned HTTP 200 and matched their source exports.

The owner confirmed an actual verification email arrived in Gmail from the configured Resend sender. This confirms that delivery example; it does not establish every auth or invitation flow on staging.

Earlier local Auth & Workspace validation covered signup/onboarding, private uploads, recovery, invitation acceptance/rotation/revocation/expiry, role restrictions, cross-workspace denial, concurrent last-admin protection, CSRF, and rate limits. These are historical local results, not a claim that the entire suite was rerun against staging.

### Preview login latency investigation

On September 24, the owner reported a roughly one-minute sign-in followed by a workspace load error on the new preview hostname. Follow-up tests measured a successful login through company onboarding at 1.7 seconds and through an existing completed workspace at 2.0 seconds (auth requests approximately 395–822 ms). Temporary test identities/workspaces were removed; no external test email was sent. A read-only check confirmed the affected account remained verified with an active membership and completed profile. The owner retried and confirmed login was fast and successful.

The original failure was not reproduced and its cause remains unconfirmed. No performance code change or database migration was made during this investigation. These samples do not establish cold-start or sustained-load performance. If it recurs, capture request timing and the failing response before assigning a cause.

## Waitlist — public release, September 25

- Approved Figma waitlist `1024:60322`, Updates `1047:56211`, and OG `989:109950` are implemented with the original assets and design font. Desktop/mobile use the email-only 40px form, success/duplicate states, two scrollable product updates and `https://x.com/rekannapp`.
- Neon production branch `br-purple-water-b3gx5d4v` has migrations 0000–0005; development has 0004–0005. The restricted `rekann_waitlist_runtime` role cannot read auth users/workspaces. Atomic deduplication, consent recording, IP rate limiting, signed unsubscribe, verified suppression webhooks and durable Resend delivery retries are implemented separately from app accounts.
- Public `SITE_MODE=waitlist` serves `/` without an auth/database bootstrap and blocks app registration/workspace routes. App mode preserves the current preview behavior and offers `/waitlist` for review.
- Frozen install, strict typecheck, the waitlist environment build, 11 unit/database/security tests and 10 browser scenarios passed locally. Browser coverage includes 1440px, 392px and 320px layouts, update navigation/scroll, original screenshot aspect ratio, submit/error/duplicate states, focus restoration and unsubscribe confirmation. The local marketing environment also returned the correct root/robots and blocked auth routes.
- Live cold-network comparison: first paint 3.64 → 2.52 seconds; enabled signup 4.09 → 2.80 seconds at 1.6 Mbps / 150 ms. Initial transferred resources decreased by about 42%; motion/overlay chunks are absent until interaction. No blank-green frame, partial preview or layout shift was observed.
- Initial payload is reduced: waitlist CSS is 49.92 kB gzip (from 156.04 kB), the dashboard is a lossless 60 KiB WebP (from 135 KiB PNG), and decorative preview requests have low priority. Updates/dialogs and their motion dependency load on interaction. Ten browser scenarios, typecheck and production build passed.
- Cold loading is stabilized: optimized background and critical fonts are embedded in the initial waitlist CSS, while dashboard preview motion waits for image decoding. Ten browser scenarios cover delayed images, no-JavaScript rendering and focus stability; the throttled cold production build recorded no plain-green frame, partial preview or layout shift.
- Signup controls stay stationary after a focus/blur regression fix. Typing, clearing, tabbing to the submit button and clicking outside the form no longer replay the entrance. Eight browser tests and the waitlist build passed.
- Waitlist motion polish is live: staggered hero/dashboard entrances, reversible Updates panel transitions, shared modal exits and success feedback. Eight browser scenarios, typecheck and the waitlist build passed; reduced-motion preferences and rapid close/reopen are covered. Live update navigation was verified.
- Owner-authorized public deployment: `rekann-waitlist`, version `ebca3c9c-bf9e-4325-90a5-6dff4d4b9c01`. Worker Routes cover apex/www using existing proxied DNS; www redirects to the apex. Favicon/Apple icon/OG assets match source bytes. App/auth endpoints are blocked and preview sign-in remains available. Scrollbar is outside update cards and the 40px white input uses auth border/focus styling.
- Live signup (761ms sample), duplicate detection (314ms), persisted consent, signed one-click unsubscribe, invalid-token rejection, non-mutating GET and preserved unsubscribe all passed. All three synthetic test recipients remain unsubscribed and their sync queue is drained. Resend confirmed welcome delivery with one message per recipient; real provider unsubscribe webhooks and the actual email unsubscribe link synchronized both directions. No real user inbox or campaign was messaged. Input now inherits shared auth input styling directly, verified by computed-style comparison and six browser scenarios. No commit or push was made. See `docs/WAITLIST.md`.

## Next work

1. Complete staging acceptance: password reset, invitation through acceptance, private logo/avatar upload, sign-out/sign-in, and role/access checks. The owner plans to perform real-email testing.
2. Owner review of Admin Leaves on preview staging, including calendar, policies, closure impact and responsive behavior. Attendance remains a separate implementation slice.
3. Connect dashboard widgets and setup progress to real module data as those modules are implemented; decide server persistence for Quick notes.
4. Owner acceptance of AI on preview staging within the approved Team Directory scope. Included inference smoke passed; workspace-owned OpenRouter live inference and broader interpretation acceptance remain pending. See `docs/AI_ASSISTANT.md`.
5. Owner acceptance of the live waitlist in a real inbox; Resend test-recipient delivery and both unsubscribe directions already passed. Operational details and queue checks are in `docs/WAITLIST.md`.
6. Reconcile documentation and review local changes before a GitHub PR/merge. The existing CI deploys `main` to the default production Worker; staging deployment does not establish production readiness. Verify production resources, recovery, and deployment targeting before release or real employee data.

## Historical design work

The following records describe earlier local implementation work. Any statements about pending production integration refer to that earlier phase; current staging status is recorded above.

## Figma fidelity follow-up

The owner requested a detailed fidelity correction on September 15, 2026. The same feature branch now uses the exact green/hover tokens, 10 px control radii, 36 px desktop controls, layered focus rings, original compact brand/lanyard/icons, 48 px onboarding header, and measured card/form geometry. OTP uses six visual cells over a native input. Profile and optional private details are separate steps, and Choose avatar is functional. `docs/DESIGN_SYSTEM.md` records node IDs, dimensions, responsive exceptions, and product-copy decisions. The added visual scenario checks exact CSS tokens and Figma bounds with a 1 px tolerance. Production integration and deployment remain pending.

Local dev and preview now use port 4310, keeping Rekann separate from other projects using port 3000. The local auth origin and browser tests use the same address.

Newly verified owners with no workspace are routed directly to company onboarding. The workspace chooser only appears when an account has multiple workspaces; invitation redirects remain unchanged.

The owner approved new Location and Industry dropdown designs in Figma on September 15, 2026. Company onboarding now uses these custom menus. Location has searchable ISO country/territory coverage, Indonesia first, then English alphabetical ordering; no IP lookup or automatic selection. Menu states and Figma links are recorded in `docs/DESIGN_SYSTEM.md`.

Dropdown interactions now adapt Fluid Functionalism scrollbar, motion, and nearest-row hover patterns using Radix ScrollArea and Framer Motion. Shared spring tokens and a reusable scroll-area component support future lists. Custom desktop thumbs are 3–6 px, touch scroll remains native, overflow edges fade, and reduced motion disables spatial animation. Surfaces/dark mode remain explicitly deferred.

Avatar picker now includes 40 Avvvatars-derived solid colors with initials and only four Oreo gradients: Silk, Flare, Nova, and Jade. No avatar generator ships in browser JavaScript; the Oreo generator is development-only, and generated SVGs load on picker opening. Selection retains the existing PNG/private upload path. Source licenses are preserved in THIRD_PARTY_NOTICES.md.

Gradient expansion: the four allowed families now span all 40 Oreo palettes (160 combinations). The picker loads 12 per batch, supports Shuffle without changing the selected avatar, displays real loading skeletons, and offers retry for failed images. Browser validation covers disjoint shuffled batches, delayed image loading, and selection/persistence.

Solid-color avatars selected during onboarding now follow live name initials in both previews, retaining the color through the optional-details step and submitting the final PNG. Gradient/photo choices remain independent of the name. Existing image-only selections require color reselection to enable the live behavior.

## Team Directory development verification — September 26

- Desktop bounds were checked against Figma section 938:49767: sidebar/header/toolbars, search field, table rows, and grid cards.
- Browser verification covers real authorized directory reads, cross-workspace rejection, populated visual fixtures, combined filters, search, sorting by keyboard, page-size changes, pin/view persistence, empty/error/retry/loading and reduced motion. Grid and table were checked down to 320px without document overflow.
- Test fixtures use isolated identities and are cleaned up; no sample employees were inserted into the owner's workspace.
- Build/typecheck and focused tests are recorded in docs/TEAM_DIRECTORY.md. No staging/production release, commit or push was performed for this phase.

## Add Employee development verification — September 27

- Figma section 951:67790 implemented as Personal → Employment → Additional, with corrected copy/placeholders, shared controls, original backdrop/icons and responsive layout. Saved-record and invitation screens show actual employee/workspace data.
- Drafts and ready records are persisted independently of auth accounts. Invitation acceptance links the record to one workspace membership without duplicating the directory entry. Duplicate email/ID, stale edits, permission boundaries, private media targeting and failure retries are covered.
- Generated migrations 0007–0008 are applied to development only. No sample employees remain in the owner's workspace; browser-test identities are cleaned up.
- Frozen dependencies, TypeScript, build, 15 unit tests and focused directory/Add Employee browser checks passed. Invitation transport was mocked for service tests; no external invitation email was sent during this validation.
- Full active-member editing, attendance/leave/documents and statistics remain deferred. See docs/TEAM_DIRECTORY.md for precise scope and checks. No deploy, commit or push performed.

- AI composer refinement (September 27): restored disabled attachment button; Team directory context menu with unavailable contexts disabled; separate model dropdown; clear textarea surface with no resize handle; provider disclosure in Your memory. Included AI uses Cloudflare Workers AI; OpenRouter keys are optional workspace connections managed in the app. No deployment.
