# Staging

Staging is deployed at https://preview-f3d09c858192da81b6d6.rekann.app. It uses the current local application, including the dashboard preview implementation. Team Directory, Add Employee and Employee Detail were deployed on September 27, 2026. Rekann AI and Admin Leaves were deployed to this preview on September 29.

## Isolated resources

- Cloudflare account: Rekann, `f0f101bf2b8415c34b2a1589e4017295`, Wrangler profile `rekann`.
- Worker: `rekann-staging`; custom domain: `preview-f3d09c858192da81b6d6.rekann.app`.
- Private R2 bucket: `rekann-staging-media`.
- Neon project: `bold-flower-53962598`; branch: `staging` (`br-nameless-salad-b3p61oq1`). Migrations through 0015 are applied to this branch; existing staging accounts were preserved.
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

Database URL, auth secret, Resend API key and the environment-specific AI encryption key are Worker secrets. Initial provisioning used ignored, mode-0600 `.env.staging-secrets.json`; owner migration credentials are in ignored `.env.staging-migrations`. Never commit or display either file. Subsequent deployments retain Worker secrets.

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

## September 29 AI release

- Application/configuration commit: `f59c2d6` on `feat/auth-workspace`; pushed to GitHub without merging `main`.
- Active Worker version: `4adc9c7a-a230-40a0-b213-4cd2fc7eb96a`, serving 100% of `rekann-staging` traffic at the preview hostname.
- The generated build target was checked for the staging account, Worker name, custom domain and R2 bucket. Staging now has the `AI` binding, `REKANN_AI_ENABLED=true`, and its own server-only encryption secret. No workspace OpenRouter key is required for included AI.
- Migration and runtime connection hosts were matched to Neon staging branch `br-nameless-salad-b3p61oq1`, endpoint `ep-twilight-star-b3e6tf0x`. Applied 0010–0013 and verified runtime CRUD grants on all four AI tables. Existing users/workspaces were preserved; no production migrations were run.
- Development and staging each retain an explicitly allocated 65,536-token daily pool and 1,000,000-token monthly pool in separate database ledgers. See `docs/AI_ASSISTANT.md` for combined allocation and limits.
- Validation: regenerated Worker types, TypeScript and staging build passed. The immediately preceding code checkpoint passed 40 unit tests and focused browser flows; Employee Detail required one separate successful rerun after an unexplained navigation failure.
- Live staging smoke passed sign-in, included connection without a workspace key, anonymous-access denial, private memory save/clear, AI page, model menu, mobile overflow check and Assistant drawer. Real Cloudflare directory counts returned the expected temporary workspace count in English (2.565 s, 373 tokens) and Indonesian (1.937 s, 377 tokens). These are individual smoke samples, not latency guarantees or broad model-quality acceptance.
- Temporary verified test identity/workspace were removed. Final counts matched the pre-release baseline: 11 users and one workspace. No external email was sent; aggregate AI usage accounting remains retained by design.
- Public waitlist deployment history was identical before and after; active version remains `ebca3c9c-bf9e-4325-90a5-6dff4d4b9c01`. No deployment targeted `rekann.app`, `www.rekann.app` or the default production Worker.
- Workspace-owned OpenRouter live inference and real-email/upload acceptance were not repeated in this release.

## September 29 Admin Leaves release

- Application commit: `f02794b` on `feat/admin-leaves`; draft PR [#13](https://github.com/uxerflow/rekann/pull/13) targets `feat/auth-workspace`. No merge to `main`.
- Active `rekann-staging` version: `8247e7ce-1e3d-4ef8-8d39-9f05b5551b23`, built with `CLOUDFLARE_ENV=staging`. Generated Worker name, account, preview custom domain and staging R2 bucket were checked before deployment.
- Neon owner and runtime connection hosts were matched to staging endpoint `ep-twilight-star-b3e6tf0x` on branch `br-nameless-salad-b3p61oq1`. Migrations 0014–0015 were applied and runtime CRUD grants on `leave_policy` verified. Existing account/workspace counts were unchanged.
- Frozen install, changed-source formatting, TypeScript, staging build and all 51 unit tests passed. The final 11 Leaves unit cases were rerun after boundary validation changes. Local browser scenarios passed for Admin Leaves, Employee Detail and shared dropdowns. They cover persistence, closures, failure/retry, keyboard and hover interaction, mobile overflow and form discard.
- Live staging smoke passed verified-account sign-in, anonymous-access denial, employee denial of admin data, repeat approval without duplicate deduction, closure refund, employee selection and time-off recording through the browser, persistence after refresh, and mobile overflow. There were no browser exceptions. Screenshots were inspected at desktop and mobile sizes.
- The temporary test workspace and two verified identities were removed in cleanup. Final counts matched the existing baseline: 11 users, one workspace. The smoke did not send external emails or change owner data.
- Public waitlist active version remains `ebca3c9c-bf9e-4325-90a5-6dff4d4b9c01`. No Worker upload, migration or route change targeted production.
- This release stores policy payment/attendance terms but does not run payroll, issue unused-leave payouts, or generate attendance records. External holiday feeds and a separate employee Leaves screen are not included. See `LEAVES.md` for the complete behavior and owner acceptance boundaries. Live attachment delivery was not repeated in this staging smoke; the reused document upload flow passed Employee Detail browser regression locally.
