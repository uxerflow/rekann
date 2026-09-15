# Rekann

An open-source people workspace for small teams. Built with TanStack Start, React, TypeScript, Cloudflare Workers, Neon PostgreSQL, Drizzle, and Better Auth.

The current feature branch includes email/password authentication, email verification and recovery, company/profile onboarding, workspace switching, employee invitations, and workspace-scoped roles. Product and setup decisions are documented in [Auth & Workspace](docs/AUTH_WORKSPACE.md).

## Local setup

Use Node.js 24.21.0 (`.nvmrc`) and pnpm 11.19.0. The repository contains one application package. If pnpm is not on your PATH, use `corepack pnpm` in place of `pnpm`.

```sh
pnpm install --frozen-lockfile
cp .env.example .dev.vars
openssl rand -hex 32
```

Set `BETTER_AUTH_SECRET` to the generated value in `.dev.vars`. Set `DATABASE_URL` to a **development** Neon database connection and keep `BETTER_AUTH_URL=http://127.0.0.1:4310`, `APP_ENV=local`, and `EMAIL_DELIVERY=local`. Never commit this file or paste its values into issues or pull requests.

```sh
pnpm db:migrate
```

Migrations are generated from `src/server/schema.ts` with `pnpm db:generate` and applied from the tracked `drizzle/` directory. Review generated SQL before applying it. `db:migrate` reads `.dev.vars` and, if present, the overriding database-owner connection in `.env.migrations`.

For a new development database, `node scripts/provision-runtime.mjs` can create a restricted runtime role after migration. It saves owner credentials in `.env.migrations` and updates `.dev.vars` with the application connection. It refuses to replace an existing runtime role or existing migration credentials. The runtime can operate on application tables but cannot create tables or delete audit records.

Start these in separate terminals:

```sh
pnpm mail:dev
pnpm dev
```

- Application: http://127.0.0.1:4310
- Local inbox: http://127.0.0.1:8025

Create an account in the application and copy its real verification code from the local inbox. No email is sent externally in local-delivery mode. The inbox holds messages in memory and clears them when stopped. Local R2 images are persisted by Wrangler under ignored `.wrangler/` state.

If NVM is unavailable, run commands under the pinned Node version with `npm exec --yes --package=node@24.21.0 -- corepack pnpm <command>`.

## Verification

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test:unit
pnpm exec playwright install chromium
pnpm test:e2e
pnpm audit
```

Unit tests require no credentials or browser. End-to-end tests run against the configured local application and development database, use synthetic `@example.test` accounts, and capture email in the local inbox. They exercise real Better Auth handlers, Neon transactions, workspace permissions, and local R2 access. Do not point them at production. Some expiry fixtures update only the test invitation they created. Test-created workspaces/accounts remain in the development branch; screenshots are ignored under `test-results/screens/`.

`pnpm preview` runs the production build locally at port 4310, matching the development auth origin. Stop the development server before starting preview. Rekann uses its own port to avoid colliding with other projects.

`pnpm cf-typegen` regenerates Workers types. TanStack generates `src/routeTree.gen.ts` during build/dev. Do not edit generated files. `pnpm format` and `pnpm format:check` use Prettier.

## Production integration

Complete this phase after reviewing the implementation:

1. Apply reviewed migrations to the production Neon database using its owner connection; create a separate runtime role with only the necessary table permissions.
2. Provision the private R2 bucket named by `MEDIA` in `wrangler.jsonc`. Keep public bucket access disabled.
3. Set Worker secrets `DATABASE_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, and `EMAIL_FROM`. `EMAIL_FROM` should use a domain verified in Resend.
4. Set `BETTER_AUTH_URL` to the exact public HTTPS origin, `APP_ENV=production`, and `EMAIL_DELIVERY=resend`.
5. Test real verification, recovery, invitations, image access, and deployment limits before opening public registration. Verify backup/restore separately before storing real employee data.

Better Auth is an embedded open-source library and requires no hosted-auth account. Neon is used only for PostgreSQL. Google OAuth is not enabled.

This checkout targets the Rekann Cloudflare account and GitHub repository. Forks/self-hosted installations must replace `account_id`, Worker name, bucket name, and public URL in `wrangler.jsonc`, configure their own GitHub deployment environment, and remove or replace the `.neon` project context. Never reuse another deployment's credentials.

GitHub Actions verifies pull requests and deploys `main` through the `production` environment after CI succeeds. Keep `main` as the only long-lived branch; staging and production are environments. Do not merge an integration-incomplete auth branch into automatic production deployment.

## Product and design

[Rekann Workspace in Notion](https://app.notion.com/p/3cf86acb0f8080ce828dffb1a90e037a) is the canonical product source. `docs/PRD.md`, `docs/SRS.md`, and `docs/SDD.md` link to the baseline. [Auth & Workspace](docs/AUTH_WORKSPACE.md) records the owner-reviewed decisions for this implementation; [Design system](docs/DESIGN_SYSTEM.md) describes its reusable foundations. See `PROJECT_STATE.md` for actual verification and remaining setup.

Discuss the project in Indonesian; write source, documentation, and application copy in English. Read `AGENTS.md`, [CONTRIBUTING.md](CONTRIBUTING.md), and [SECURITY.md](SECURITY.md) before contributing.

## License

[Apache License 2.0](LICENSE).
