# Project State

Updated: September 15, 2026.

## Current phase

Auth & Workspace implemented on `feat/auth-workspace`, following the owner's approval and review of the Figma Auth section. PRD, SRS, and SDD were read from Notion. The owner requested that Resend and remaining production service configuration happen after implementation. The previously deployed foundation is recorded below; this auth branch has not been deployed remotely.

The implementation includes email/password signup and sign-in, six-digit verification, password reset, company/profile onboarding, private company/profile images, create/join/switch workspaces, invitations, Team, and Roles & access. Google OAuth is disabled. Interface and email copy are English. Admin is workspace-scoped; Manager / HR is optional with individually delegated invitation/removal permissions; Employee is the default non-admin role. See `docs/AUTH_WORKSPACE.md` and `docs/DESIGN_SYSTEM.md`.

## Database and runtime

- Neon organization/project: Rekann / Rekann App (`bold-flower-53962598`), Singapore.
- Created development branch `auth-development` (`br-holy-feather-b33zppyv`) from the empty production branch. Applied tracked migration `0000_thankful_groot.sql` to development only.
- Nine tables cover Better Auth identity/sessions/verification/rate limits and workspace/membership/invitations/audit.
- The application uses `rekann_runtime`, verified unable to create tables or delete audit events. Runtime credentials are in ignored `.dev.vars`; migration owner credentials are separate in ignored `.env.migrations`, both with restrictive file permissions.
- Neon CLI `.neon` context remains production. Use the explicit development branch name when requesting CLI connection strings.
- R2 is bound as `MEDIA` for local private image tests. A production R2 bucket has not been provisioned in this task.
- Development email goes to a loopback-only, in-memory inbox. No real verification, reset, or invitation email was sent externally.
- Temporary connection-string files were removed. Secrets were scanned against source candidates and browser output without exposing their values.

## Verification

Completed checks for the implementation:

- Frozen dependency installation, production build, strict TypeScript, and formatting checks.
- Unit tests for production/local-email configuration boundaries, invalid dates/time zones, safe invitation redirects, and bounded streamed JSON.
- Eight end-to-end scenarios against the local **production Workers build**, actual Neon development PostgreSQL, and local private R2.
- Browser coverage: desktop signup, code verification, company/profile onboarding, image upload, workspace entry, Team, persisted manager settings, sign-out; mobile invitation signup/acceptance/profile, password recovery and sign-in; keyboard navigation, password visibility, invalid invitation screen, and horizontal-overflow checks.
- API coverage: unverified access denial, password policy, single-use OTP, reset session revocation, sign-out, unknown-account recovery response, database rate limits, blocked unused auth endpoints, cross-workspace denial, employee escalation attempts, manager restrictions, immediate role/removal effects, invitation rotation/revocation/expiry, concurrent invitation acceptance, concurrent last-admin protection, private image authorization, invalid image rejection, and CSRF rejection.
- Visual inspection of desktop auth/company/profile/workspace and mobile profile/access screens. Screenshots remain under ignored `test-results/screens/`.
- Dependency audit reports no known vulnerabilities. Targeted overrides address the inherited Miniflare image library and drizzle-kit legacy esbuild dependency.
- No credential values found in version-controlled candidates or the complete browser bundle.

These checks establish local implementation behavior. They do not establish real email deliverability, production CPU capacity, or disaster recovery readiness.

## Final integration phase

1. Configure a verified Resend sender and its Worker secrets.
2. Provision the private production R2 bucket and production runtime database role.
3. Apply the reviewed migration to production with the migration owner credentials; set production application secrets and the exact HTTPS auth origin.
4. Deploy after integration review, then test real verification/recovery/invitation emails and private images on the public Worker. Measure actual Workers CPU/usage against the selected plan.
5. Verify database recovery before using real employee data. Replace the provisional logo when the final brand is ready.

Do not merge this integration-incomplete branch into automatic production deployment. Keep the branch reviewable while the final service setup is pending.

## Foundation history

The empty-directory rebuild used TanStack Start 1.168.49, React Router 1.170.32, React 19.2.8, TypeScript 5.9.3, Tailwind 4.3.3, Vite 8.2.2, Cloudflare Vite plugin 1.54.4, and Wrangler 4.129.0. Framework versions remain pinned. Auth dependencies and testing/formatting tools were added with pinned versions and the lockfile.

The public canonical repository is `https://github.com/uxerflow/rekann`, Apache-2.0, managed via `barlydesign`. `main` is the only long-lived branch; PRs use short-lived work branches. The recorded foundation deployment is commit `df0b9183342b27e1773e1a234f6fac7ddebdc0c4`, Worker version `7df8dfc8-077e-4ca5-a6c7-5f153807ebd2`, at `https://rekann-app.rekann-app.workers.dev`. GitHub Actions deploys `main` after CI passes using the `production` environment. Account routing is documented in `AGENTS.md`.

## Figma fidelity follow-up

The owner requested a detailed fidelity correction on September 15, 2026. The same feature branch now uses the exact green/hover tokens, 10 px control radii, 36 px desktop controls, layered focus rings, original compact brand/lanyard/icons, 48 px onboarding header, and measured card/form geometry. OTP uses six visual cells over a native input. Profile and optional private details are separate steps, and Choose avatar is functional. `docs/DESIGN_SYSTEM.md` records node IDs, dimensions, responsive exceptions, and product-copy decisions. The added visual scenario checks exact CSS tokens and Figma bounds with a 1 px tolerance. Production integration and deployment remain pending.

Local dev and preview now use port 4310, keeping Rekann separate from other projects using port 3000. The local auth origin and browser tests use the same address.
