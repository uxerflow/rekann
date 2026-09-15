# Authentication and workspace implementation

## Approved scope

Workspace navigation uses `/w/:slug`, `/w/:slug/team`, `/w/:slug/access`, and `/w/:slug/profile`. Creation steps use `/w/:slug/onboarding/company` and `/w/:slug/onboarding/profile` after the initial company is created. Back/Continue update the URL through the router and retain the current profile draft. Slugs are unique and stable across company-name edits, with numbered collision suffixes. The database UUID remains the identity for all protected operations; slug lookup still requires active membership. Legacy `/workspace/:id?view=...` and `/onboarding/profile?workspaceId=...` links redirect to their canonical destinations.

The owner authorized end-to-end auth implementation on September 15, 2026, following the Figma auth review. Email-provider and production integration configuration are the final phase. These decisions supersede the earlier Phase 0-only restriction for this task.

- Email/password sign-up and sign-in; six-digit email verification; password recovery.
- Company setup and employee profile onboarding, including optional company/profile images.
- Create/join/switch workspaces, invite employees, resend/revoke/accept invitations.
- Workspace-scoped **Admin**, optional **Manager / HR**, and **Employee** roles. “Team” names the directory. A workspace Admin is not a platform-wide superuser.
- Admins can enable Manager / HR and delegate implemented capabilities individually. This release exposes employee invitations and employee access removal; future HR capabilities must add their own authorization checks when built.
- Google sign-in remains disabled. Better Auth runs in the application; Neon provides PostgreSQL, not hosted authentication.
- English interface, validation, accessibility labels, and email copy. The existing logo is replaceable.

## Data and authorization

Better Auth owns identity, passwords, verification, and session tables. Application-owned `workspace`, `workspace_member`, and `workspace_invitation` tables own company access. `workspace_member` is an internal relationship name; the interface uses Employee.

Every protected operation resolves the current verified session and active workspace membership. Roles are loaded from PostgreSQL on every request and are never taken from client input or a cached session. Mutations lock the workspace row and then recheck membership. This serializes permission changes, removals, invitation acceptance, and last-admin checks. A unique workspace/user index prevents duplicate membership.

An Admin can manage all implemented workspace access. A Manager can only invite or remove Employees when the corresponding permission is enabled, and cannot assign roles or manage other Managers/Admins. Turning Manager / HR off downgrades current Managers and pending Manager invitations to Employee; reenabling it does not silently restore privileges. At least one active Admin must remain.

Removing workspace access preserves the identity and other workspace memberships. It revokes pending invitations for that workspace/email. Current sessions lose access on their next protected request. Concurrent requests already in progress are serialized against workspace mutations.

Profile names, job title, avatar, and email are visible to the team. Phone and birth details are optional and only returned to the profile owner in this release. Workspace employment records remain separate from global identity.

## Auth and email behavior

- Minimum password length: 12 characters; maximum: 128. Better Auth handles hashing and session cookies.
- Verification and reset codes: six digits, ten-minute expiry, hashed at rest, bounded attempts, database-backed rate limits.
- Sessions: seven days, daily refresh, HttpOnly cookies, SameSite Lax, Secure in production, no cookie session cache.
- Resetting a password revokes existing sessions. Recovery responses for unknown addresses do not disclose whether an account exists.
- Only the selected auth routes are publicly exposed. OTP sign-in, social login, token-inspection helpers, and unrelated account-management endpoints are not exposed.
- Mutating workspace requests require the configured Origin and bounded JSON bodies. Server-side schemas reject extra role/identity fields in profile writes.
- Invitation tokens: 256 random bits, SHA-256 stored in PostgreSQL, seven-day expiry, verified-email match, single membership on retries. Resending rotates the token; old/revoked/expired links fail.
- Resend delivery failures leave a visible failed invitation with a resend action. Tokens and email bodies are not logged.

The local inbox at `127.0.0.1:8025` captures email in memory for development and browser tests. Local delivery is rejected unless both the environment and application hostname are local. It never bypasses verification: the real code still needs to be entered.

## Images

The browser crops/resizes PNG/JPEG uploads to 320 × 320 and strips metadata through canvas encoding. The server checks MIME/signature and a 250 KB byte limit. SVG/HTML uploads are rejected. R2 remains private; each image request checks active workspace access and sends `Cache-Control: private, no-store`. This release handles company logos and profile images, not employee documents.

## Design source

Figma file: `jWSy3bCKjtKfyrToW5zyZ5`, Auth section `290:8653`. Read through the local figma-cli daemon/bridge; no Figma MCP was used and the design file was not modified.

Reference screens include Login `196:5126`, Signup `209:5559`, Email verification `209:7075`, Invalid code `209:7180`, Company `209:7221`, Profile `209:7394`, and Employee invitation `209:7725`.

Inter typography, 368 px auth forms, 480 px onboarding forms, white surfaces, green brand, and the original decorative assets are preserved. Actions, borders, radii, focus rings, and control dimensions now use the measured Figma component variants. Recovery, workspace selection, Team, and Roles & access extend the same visual language. On mobile the decorative preview yields space to the form. Workspace setup ends after two steps: company and creator profile. Invited employees separately complete profile and optional employee details, including phone and birth information. Creator identity determines the flow, not role. The indicator reflects the current step. Company description, last name, and job title are required, matching the supplied labels.

After email verification, an account with no workspace goes directly to company onboarding. A single workspace opens directly, while the workspace chooser is reserved for accounts with multiple workspaces. Invitation links continue their invitation flow before owner onboarding.

## Operational boundaries

Use a separate Neon development branch for synthetic test accounts. Apply tracked SQL migrations before running the application. Production needs its own runtime database credentials, auth secret, trusted HTTPS URL, private R2 bucket, and verified Resend sender. Environment secrets must not be committed.

Production backup/restore, delivery to real email providers, Workers CPU usage under actual production load, and domain configuration require final operational verification. The local browser suite does not prove production deliverability or production capacity.
