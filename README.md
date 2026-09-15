# Rekann

Lightweight people workspace for small teams.

## Local development

Use Node.js 24.21.0 (`.nvmrc`) and pnpm 11.19.0. With NVM installed, run `nvm install` and `nvm use` in this directory. Install pnpm separately if it is not available.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm dev
```

Development runs at http://127.0.0.1:3000. To test the production build locally, run `pnpm preview` and open http://127.0.0.1:4173. Stop either server with Ctrl+C. Both use the Cloudflare Vite plugin and local Workers runtime; no Cloudflare login is required.

`pnpm cf-typegen` regenerates Workers types. TanStack generates `src/routeTree.gen.ts` during development/build; run the build before typechecking a fresh scaffold.

If NVM is unavailable, the existing npm installation can run the app with the pinned Node version without changing the global Node installation:

```sh
npm exec --yes --package=node@24.21.0 -- pnpm dev
```

## Foundation scope

One application package: TanStack Start, React, strict TypeScript, Tailwind CSS, Vite, and Cloudflare Workers. The home page contains only the product name and description. No authentication, database, storage, email, credentials, or remote resources are configured. No favicon has been provided yet.

Application versions and the pnpm lockfile are intended for version control. Dependency installation uses a seven-day minimum release age and explicitly permits only required esbuild/workerd installation scripts. Review dependency updates deliberately.

## Product documentation

[Rekann Workspace](https://app.notion.com/p/3cf86acb0f8080ce828dffb1a90e037a) is canonical. Files in `docs/` link to the approved specifications; `PROJECT_STATE.md` records local verification. Read `AGENTS.md` before making changes.

Foundation integration follows the official [TanStack Start setup](https://tanstack.com/start/latest/docs/framework/react/build-from-scratch) and [Cloudflare Workers guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/).

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a material change. Report suspected vulnerabilities privately according to [SECURITY.md](SECURITY.md).

## License

Rekann is licensed under the [Apache License 2.0](LICENSE).
