# Contributing to Rekann

Thanks for your interest in Rekann. The project is in an early foundation phase, so open an issue before starting a substantial feature or architectural change.

## Development

Use Node.js 24.21.0 and pnpm 11.19.0.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
```

Keep pull requests focused and explain the problem, resulting behavior, and validation performed. Write source code, documentation, application copy, and commit messages in English. Never include credentials, production data, or private workspace information.

Create work from `main` in a short-lived branch named `feat/*`, `fix/*`, `docs/*`, or `chore/*`. Open a pull request, wait for CI, and merge it into `main`. Staging and production are deployment environments and do not use permanent Git branches.

By submitting a contribution, you agree that it is licensed under the Apache License 2.0 used by this repository.

## Reporting security issues

Do not open public issues for suspected vulnerabilities. Follow the private reporting instructions in `SECURITY.md`.
