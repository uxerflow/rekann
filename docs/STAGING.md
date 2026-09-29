# Staging

Staging is deployed at https://preview-f3d09c858192da81b6d6.rekann.app. It uses the current local application, including the dashboard preview implementation. Team Directory, Add Employee and Employee Detail were deployed on September 27, 2026.

## Isolated resources

- Cloudflare account: Rekann, `f0f101bf2b8415c34b2a1589e4017295`, Wrangler profile `rekann`.
- Worker: `rekann-staging`; custom domain: `preview-f3d09c858192da81b6d6.rekann.app`.
- Private R2 bucket: `rekann-staging-media`.
- Neon project: `bold-flower-53962598`; branch: `staging` (`br-nameless-salad-b3p61oq1`). Migrations through 0009 were applied to this branch; existing staging accounts were preserved.
- Restricted database role: `rekann_runtime`. Production and local development data are separate.
- Resend sender: `Rekann <noreply@updates.rekann.app>`.
- `APP_ENV=production` enables HTTPS and secure cookies on staging; resource isolation comes from the Wrangler environment and separate database branch.

## Deploy

```sh
corepack pnpm exec wrangler whoami
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm test:unit
CLOUDFLARE_ENV=staging corepack pnpm build
corepack pnpm exec wrangler deploy --config dist/server/wrangler.json
```

The Vite plugin selects the environment at build time. Inspect the generated configuration before deployment; its Worker name must be `rekann-staging`. Building without `CLOUDFLARE_ENV=staging` targets the default environment instead.

Database URL, auth secret and Resend API key are Worker secrets. Initial provisioning used ignored, mode-0600 `.env.staging-secrets.json`; owner migration credentials are in ignored `.env.staging-migrations`. Never commit or display either file. Subsequent deployments retain Worker secrets.

## Manual acceptance

Open `/sign-up` and register with a real email address. Staging uses separate accounts from local development, so an address used only locally can be registered here. Existing staging accounts should sign in instead. Complete the email code, company and profile onboarding. Check logo/avatar upload, sign-out/sign-in, password reset and employee invitations. The owner confirmed receipt of a real verification email on September 24, 2026. Recovery, invitations, uploads, and complete authenticated flows still need staging acceptance; deployment smoke checks do not establish that they pass end to end.

The staging URL is internet-accessible; application data still requires authentication. Use test data only. The root domain and waitlist are not deployed by this setup.

## Onboarding and branding

Completed workspace onboarding redirects back to the workspace, including legacy profile links. The generic company onboarding URL resumes the user's existing workspace flow; creating another workspace is an explicit action using `?newWorkspace=true`. Editing a completed profile remains available from the profile page. The company onboarding mutation rejects changes after completion.

Browser favicons and the Apple touch icon are exported from Figma node `387:12176` in file `jWSy3bCKjtKfyrToW5zyZ5`, preserving the original background and symbol.

The preview hostname uses a random suffix for less obvious discovery. This is not an access control: login and workspace authorization still protect application data. The old staging hostname is removed rather than redirected. Existing accounts remain in the same database; users must sign in again on the new hostname. Old email invitation links need the new origin or a newly issued invitation.


## September 27 release

- Worker version: `97c4e427-0701-4f95-a231-dcc647351de3`.
- Built with `CLOUDFLARE_ENV=staging`; generated configuration was checked for the staging Worker, preview hostname and staging R2 bucket before deployment.
- Verified migration credentials against Neon branch `br-nameless-salad-b3p61oq1`; applied pending migrations 0004–0009 and verified runtime privileges for all five employee tables. No production database migrations were run.
- Frozen install, typecheck and staging build passed. The preceding feature verification passed 19 unit tests and three directory/add/detail browser scenarios.
- Live staging smoke checks used a temporary verified test identity and workspace: sign-in (1.2 seconds), directory/detail rendering, attendance reads, leave allowance/request/cancellation and private document links all passed. No browser exceptions occurred. Test identity/workspace were deleted afterward; no external email was sent.
- Production waitlist remained on version `ebca3c9c-bf9e-4325-90a5-6dff4d4b9c01`; its page title, signup CTA and asset references were unchanged. Only `rekann-staging` was deployed.
- Live file upload/download and real invitation-email delivery were not repeated during this release smoke check; their feature behavior was covered by development and mocked-transport tests. Owner staging acceptance remains the final UX check.
