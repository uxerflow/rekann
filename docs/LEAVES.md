# Admin Leaves

Owner-authorized implementation of the Admin Leaves flow on September 29, 2026. Design: [Rekann Admin Leaves](https://www.figma.com/design/jWSy3bCKjtKfyrToW5zyZ5/Rekann---HR-Platform?node-id=1199-60931); shared dropdown reference: node `295:10750`. Read through the local figma-cli bridge; no Figma master changes. The linked Notion PRD, SRS and SDD remain the product baseline.

## Implemented scope

- `/w/:slug/leaves` is an admin-only workspace view with Week, Month and Year calendars, pending requests, request details, employee selection, approved time-off recording, approval, rejection with reason, and cancellation.
- Request and policy lists support search, filters, sorting and pagination. Loading, empty, no-results, failure/retry and saved states use existing Rekann components.
- Annual, custom and company closure policies persist eligibility, allowance, period, notice, duration, documents, request frequency, simultaneous absence, approver and payment settings. Each form previews its coverage and impact before saving; unsaved changes require explicit discard.
- Policy dropdowns reuse `SelectField`, including searchable employee selection, multiple eligibility choices, one hover highlight, keyboard selection and a 1.5 px check. Dialogs, popovers, scroll areas and reduced motion reuse the shared UI.
- Desktop geometry follows the Figma layout; narrow screens retain accessible controls and contain wide tables/calendars within their scroll area. Source SVGs are in `public/leaves`.

## Data and permissions

`leave_policy` is workspace-scoped. Existing `employee_leave` records now optionally retain the policy ID and rule snapshot. Migrations 0014 and 0015 create the policy storage and grant the restricted runtime role access. Existing employee records and manually configured allowances remain supported.

Read and write endpoints authenticate membership on the server. Only admins manage the workspace calendar and policies. Existing employee self-service stays in Employee Detail; this release does not add a separate employee Leaves screen. Record time off adds approved leave for another employee; an admin requests their own leave through Employee Detail and cannot approve it themselves. Owner-only policies enforce the workspace creator; HR Admin requires an admin; department-manager review uses existing delegated employee permissions. Admins retain management access.

Policy and leave mutations acquire the workspace lock. Policy versions reject stale writes. Request IDs make record/review retries safe; permissions, status transitions, document ownership, date overlap, limits and available balance are rechecked inside the transaction. Attachments reuse private R2 documents and their authorized access endpoint. Audit events record the mutations.

## Balance behavior

- Working days are Monday–Friday. Calendar-day policies count every date. Configured company closures are included; no external national-holiday feed or work-schedule engine is introduced.
- Allowances can reset monthly, quarterly or annually; annual leave also supports employment anniversaries, including February 29. Requests spanning allowance periods must be split. There is no automatic prorating for partial years.
- Annual edits take effect from the following January 1. An anniversary cycle retains the rules effective when that cycle started. Existing requests retain their request-rule snapshot. Manual allowances override the policy entitlement for their period's starting year.
- Approved requests consume balance. Pending requests count toward request-frequency limits but do not reserve balance; approval rechecks available balance. Carry forward includes unused carried days and closure deductions, excluding periods before joining or satisfying eligibility.
- Closure coverage is captured as member IDs when scheduled, so later team changes do not silently change affected balances. Closures cannot overlap for the same covered employee. Once a closure starts, it cannot be changed through this flow.
- Closure choices can refund overlapping approved days, keep them charged, deduct annual leave, cancel pending requests, retain them for review, and block new bookings. Annual deduction never double-charges retained bookings. Reductions or closure changes that would create negative balances fail atomically.
- Payment rates, tiered pay, unused-day payout and attendance status are saved policy terms. This release does not run payroll, issue payouts or generate attendance records; those modules are outside this slice.

Employment choices use the existing Team Directory values (`Full-time`, `Contract`, `Part-time`, `Internship`, `Freelance`). No employee status is silently renamed to match illustrative Figma labels. Policy names are immutable after creation because historical leave types use those names; deactivate a policy to stop new requests while retaining history.

## Verification

Behavior tests are in `tests/leaves.unit.spec.ts` and `tests/leaves.spec.ts`. They cover workspace/admin boundaries, stale policy edits, eligibility, request rules, approval retries, owner review, period boundaries, carry forward, closure refunds, retained requests, insufficient balance rollback and unlimited allowances. Browser coverage uses isolated development fixtures with cleanup and exercises calendar navigation, employee selection, approval/rejection, persistence after reload, policy/closure creation, failure/retry without lost input, empty search, responsive overflow, keyboard selection and dirty-form discard.

Release-specific build, test and deployment evidence is recorded in `PROJECT_STATE.md` and `docs/STAGING.md`. Owner visual acceptance remains the final review; automated checks do not establish pixel-perfect identity on every viewport.
