# Team Directory and Add Employee

Approved for development on September 26, 2026. Figma section: [Team Directory](https://www.figma.com/design/jWSy3bCKjtKfyrToW5zyZ5/Rekann---HR-Platform?node-id=938-49767). References: list 77:3478, grid 95:7420, empty 907:56573, list error 938:44467, grid error 938:49440, search/filter/loading variants in the same section.

## Included

- Workspace-scoped live directory at /w/:slug/team with list/grid views.
- Case- and accent-insensitive search across name, email and employee number.
- Combined department/employment type filters, reset, name/start-date ordering.
- Pagination with 15, 30 or 50 employees per page; search/filter/page-size changes reset the page.
- Personal pins and preferred view stored on this browser, keyed by workspace and membership. Pins sort before the chosen order; they never modify other users' views.
- Skeleton loading, genuine empty, no matching results, request failure and retry.
- Responsive cards and horizontally scrollable table on narrow screens, accessible controls, shared dropdown/scroll primitives and reduced-motion behavior.

The directory request authorizes current active membership before selecting only work identity fields. It excludes removed members and does not return phone, date/place of birth, emergency contact or address data. No permission changes are made by directory browsing.

For small-team scope, one authorized request retrieves the directory; filtering and pagination are local, without a network request on every keystroke. Large-organization server pagination is not part of this phase.

## Data and migration

Migration 0006 adds nullable employee_number, department, employment_type and start_date to workspace_member, with unique employee numbers within each workspace and a checked employment type. Existing employment information remains unknown (rendered as “Not assigned” for employee IDs and “Not set” for missing positions, employment types or start dates; missing department sublines are omitted), rather than deriving start dates from account creation or inventing full-time employment.

The migration was applied to the configured local-development database. It has not been applied to staging or production. Those environments must apply it before deploying this code because existing membership queries select all columns.

The Add Employee phase below populates these fields after invitation acceptance. It adds separate, authorized endpoints for pre-account records.

## Deferred boundaries

Add Employee was subsequently authorized for development on September 27. The form and its saved-record/invitation result are implemented below. Full member attendance, leave and document views remain deferred. Existing invitation, role and removal operations remain accessible under Settings → Team access, with the original server permissions and last-admin protections. Delegated managers may open Team access but cannot open the admin role-policy editor.

Attendance, documents, leaves and personal-information panels are not part of this delivery.

## Design reconciliation

- Correct active list/grid tab, shared dashboard header and Assistant.
- Fixed Type header when filtering; Clear filters is inside the filter toolbar.
- All departments / All types use corrected plural copy.
- Pagination reflects actual matched counts.
- Real names, photos, email addresses, workspace identity and timezone replace Figma sample data.
- Native empty-state graphics and table/filter icons are exported SVGs under public/team. Avatars use the shared Avatar primitive with a circular directory presentation.
- Core desktop geometry: 240px sidebar, 48px header, 56px view toolbar; list filter bar 56px, grid filter bar 64px; 44px table header, 60px rows, 36px list avatars; four 275×232px cards at 1440px, 56px card avatars, 18px card radius, 20px gaps.

## Verification

Focused tests live in tests/team-directory.unit.spec.ts and tests/team-directory.spec.ts. Browser tests create and clean up isolated development identities without sending email. Populated visual fixtures are intercepted only inside the browser test; sample employees are never added to the application or owner workspace.

Verified on 26 September 2026: frozen dependency install, TypeScript check, production build, 14 unit tests, and the focused directory browser test passed. The browser check covers desktop geometry, list/grid controls, preference persistence, cross-workspace rejection, loading/error/retry/empty states, reduced motion, and 320–1440px viewport widths.

## Add Employee — September 27, development only

Source: [Add Member section 951:67790](https://www.figma.com/design/jWSy3bCKjtKfyrToW5zyZ5/Rekann---HR-Platform?node-id=951-67790). Personal 227:6085, Employment 227:5823, Additional 227:6371 / 951:61965, saved record 101:16176, invitation 951:62605 / 951:63163.

- `/w/:slug/team/add` has Personal, Employment and Additional steps. Back/Continue retain entered values. Unsaved navigation prompts before leaving. The shared avatar picker, inputs, selects and motion rules are reused.
- The form follows the 608px desktop column, 48px header, heading at y=150, 36px controls, field/section spacing and two-column rows from Figma. Small screens stack columns and use 44px controls. Additional information uses document scrolling. Form backdrop and work-card icons are exported Figma assets.
- Full name, normalized work email and employee ID are required. Ready records also require a valid start date. Birth dates, lengths and phone formats are validated. Duplicate email/ID checks include workspace members and saved records; active pending invitations from Team access are rejected before creating an unrelated record.
- Department/location/schedule choices use real workspace values and allow new entries. Reporting managers are active workspace admins/managers. Manager / HR access follows existing permissions; no invented departments or scheduling engine are added.
- Save as draft creates no account and sends no email. Continue draft resumes the persisted form. Add employee saves a ready record and opens Send invitation / Invite later. Send/retry uses the existing invitation service; successful sends offer Copy invite link. Expired or failed invitations can be resent, rotating the token.
- Pre-account employees are visible only to workspace admins and their permitted creator. Private details are never returned in directory responses. Saving and media operations check current permissions. Employee-photo upload/removal targets the record, never the current admin's avatar.
- Invitation acceptance links exactly one membership and transfers the entered name, ID, department, job title, employment type, start date, phone, birth details and avatar. Other personal fields stay in the authorized record. Existing account verification and profile confirmation remain in place.
- Record saves use workspace locking, optimistic versions and identical-payload retry recovery. Failed save/upload retains the form for retry. Failed email delivery preserves the saved employee and shows retry instructions.
- Migrations 0007 (employee_record) and 0008 (runtime grants) were generated and applied only to the configured development database. Together with 0006, they must be applied before a future app deployment. No staging/production release, commit or push was performed.

Design corrections: wrong address/emergency placeholders, employee role wording and invitation names/email/initials are corrected using actual data. Missing values remain explicit. Attendance statistics and tabs are not backed by data in this phase; no fabricated counts are shown. Full active-member editing and a second emergency contact are outside this Add Employee phase.

Verification: frozen install, TypeScript and build checks; 15 unit tests, the existing directory browser test, and the new Add Employee browser test passed. `tests/employees.unit.spec.ts` covers scoped permissions, duplicate/stale/identical saves, pending invitations, safe avatar targeting/removal, email failure/retry, token rotation and idempotent acceptance. Email transport is mocked in this unit test. `tests/add-employee.spec.ts` uses isolated development identities and real application APIs for saving/reopening drafts and adding without inviting; it checks 1440px geometry, 390/320px overflow, unsaved exit, recovery after a failed save, modal centering and loaded assets. It sends no external email. Screenshots are under ignored `test-results/screens/`.

## Employee Detail — September 27, development only

The owner authorized the complete employee-detail flow after the review of [section 989:105653](https://www.figma.com/design/jWSy3bCKjtKfyrToW5zyZ5/Rekann---HR-Platform?node-id=989-105653). This supersedes the earlier Add Employee phase boundary above.

- Every directory membership, including legacy members without an employee record, opens `/w/:slug/team/records/:id`. HR records are created lazily on an authorized write, never on a GET. Add Employee, saved drafts, invitation later/retry and acceptance remain connected to the same directory.
- Basic information includes profile/photo, work, personal, identification, address and two emergency contacts. Save uses section-specific validation and optimistic versions. Photo bytes and profile fields commit together; storage failure preserves existing values. Active-account email is read-only here because it belongs to authentication.
- Admins can edit, manage account roles, deactivate/reactivate and invite again. Deactivation revokes membership and pending invitations while retaining HR history. Reactivation restores employment status; a new accepted invitation restores login access. Admins can reveal inactive records in the directory. Self-deactivation and removal of the last admin are blocked.
- Admins and an enabled Manager/HR assigned as the employee’s reporting manager can read private details and manage that employee. Managers do not gain access to unrelated people. Employees can view their own data and edit their own contact/profile sections. Peers see work identity only; direct API calls enforce the same limits.
- Attendance reads persisted clock-in/out records with workspace-timezone month filtering, total and average worked hours. Self clock-in/out is idempotent with one open session. An open session remains available for clock-out when the displayed month changes. No attendance fixtures are shipped in application data.
- Leave history supports annual summary cards, recording time off, self requests, pending/approved/rejected/cancelled detail, approval, mandatory rejection reason and cancellation. Admin-entered leave for another employee is approved immediately; self requests need another authorized reviewer. Mutations serialize within the workspace, reject overlapping requests and insufficient balance, and preserve request IDs across retries. Cancellation restores availability by changing the request status rather than mutating a duplicate balance counter.
- Leave allowances are explicitly set by an admin. Initial working-day convention is Monday–Friday; half-day requests cover one date; a request must remain within one calendar year. There is no automatically invented allowance, holiday calendar, accrual or carryover. Lateness is shown as **Not tracked** until structured schedule cutoffs exist; the free-text work schedule is not treated as a scheduling policy. These policy boundaries are separate from the completed detail controls.
- Documents support categorized PDF/PNG/JPG uploads (20 MB), HTTPS links, title/file/access edits, preview, download, employee visibility, delete and 30-second Undo. File extension, MIME and signature are checked. Private R2 reads re-authorize current membership and document visibility on every request; no public object URLs are returned. Soft-deleted documents remain inaccessible and retained for recovery/audit; permanent-retention policy is not introduced by this feature. Audit events record material changes.
- Detail state stays mounted during save/reload so notices, Undo and entered text do not disappear. Tables scroll horizontally on narrow screens; document action menus render outside the scrolling table. Dialogs use shared fields/selects, ScrollArea, dirty-dismiss confirmation, native focus containment and reduced-motion styles. Select portals attach inside native dialogs to remain interactive.

Visual baseline: 1440×1024 desktop, 240px sidebar, 324px profile column, 40px gutter and 776px detail column. Figma work-card assets are reused; cards, 36px desktop controls, modal padding and section spacing follow the reviewed design. Mobile uses stacked columns and 44px touch controls. Corrections retain the design while adding an explicit personal edit entry, consistent stored address fields, meaningful missing-data labels, and “Visible to employee” wording.

Migration `0009_open_junta.sql` adds attendance, allowances, requests, private documents, a second emergency contact and inactive status, including runtime-role grants. It was applied to the configured development database only. Staging/production need migrations 0006–0009 before this code is released. No deployment, commit or push was performed for this work.

Verification: frozen install, TypeScript, build and 19 unit tests passed. The directory, Add Employee and Employee Detail browser scenarios passed against isolated development identities (1440px and 390/320px widths). These cover real persistence, dirty-edit recovery, selects in dialogs, leave balances/cancellation, file upload/manage/delete/Undo, inactive-directory recovery and reactivation. Unit checks additionally cover private-data permissions, cross-workspace rejection, stale writes, atomic photo/storage failure, self-review prevention, duplicate requests, document visibility and invitation reacceptance with retained data. Browser scenarios send no external emails; invitation transport is mocked in the unit suite. Screenshots are generated in ignored `test-results/screens/`.


### Staging release — September 27

The owner subsequently authorized staging deployment only. Worker version `97c4e427-0701-4f95-a231-dcc647351de3` includes Directory, Add Employee and Detail. Migrations through 0009 are applied to the separate staging database. Live authenticated directory/detail, leave and document-link smoke checks passed; temporary test data was removed. See `docs/STAGING.md` for evidence and remaining manual acceptance. Production `rekann.app` remains the unchanged waitlist.
