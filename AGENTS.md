# Working on Rekann

Rekann is a lightweight people workspace for small teams. Notion is the canonical product source: https://app.notion.com/p/3cf86acb0f8080ce828dffb1a90e037a. Read the relevant PRD, SRS, and SDD before material implementation; local docs are navigation links.

- Discuss the project in Indonesian. Write source, comments, documentation, application copy, and validation text in English.
- The owner decides scope and accepts work. Claude Code is the primary implementation agent; Codex is the discussion, architecture, and independent QA partner, read-only by default unless the owner authorizes a specific implementation/setup task. Existing owner authorization applies within that scope.
- Work in small, reviewable phases. Do not add speculative abstractions, features, or dependencies. The owner authorized Codex to implement Auth & Workspace end to end on September 15, 2026, with Resend and production integration setup at the end. See `docs/AUTH_WORKSPACE.md` for the reviewed scope.
- Keep one repository and one application package: TanStack Start, React, strict TypeScript, Cloudflare Workers, Tailwind, and pnpm, with Neon PostgreSQL, Drizzle, Better Auth, private R2 images, and Resend. Respect pinned versions and the lockfile.
- V1 covers people, attendance, time off, calendar, onboarding, documents, announcements, approvals, settings, dashboard, and basic reports/insights. Payroll, recruitment, performance reviews, expenses, assets, advanced scheduling/permissions, project management, daily reports, Telegram, AI, and enterprise workflows are out of scope.
- Future data follows User → Workspace Membership → Workspace. Scope every business record and protected operation to an authorized workspace; never trust client-supplied identity, role, or ownership.
- Enforce server-side authentication/authorization, boundary validation, least privilege, private documents, appropriate file-access expiry, transactional consistency, and abuse controls. Keep secrets out of Git, client code, logs, and documentation. Auth & Workspace is implemented on its feature branch; consult `PROJECT_STATE.md` for verification and production integration status.
- Do not manually edit generated route trees, Workers types, build output, or lockfiles. Use the responsible generator/package manager.
- For material changes, run frozen installation, build, typecheck, and relevant runtime/browser checks. Report actual evidence, risks, and checks not run. Add focused behavior tests when features warrant them.
- Deployment, migrations, remote writes, commits, and pushes require task-specific owner authorization. QA acceptance alone does not authorize release.
- Graphify, if introduced, is only an aid. When `graphify-out/graph.json` exists, query it for architecture/relationship questions and verify conclusions against source and Notion.

## GitHub ownership and local account routing

- Rekann is owned by the GitHub organization `uxerflow` and is managed through the personal account `barlydesign`. For GitHub operations in this repository, verify or switch GitHub CLI to `barlydesign` before creating repositories, pushing, or changing remote settings.
- The canonical Rekann remote is `https://github.com/uxerflow/rekann.git`. The owner authorized its public creation under Apache-2.0 on September 15, 2026.
- Keep `main` as the only long-lived branch. Use short-lived `feat/*`, `fix/*`, `docs/*`, or `chore/*` branches and merge them through pull requests after CI passes. Treat staging and production as deployment environments rather than Git branches.
- This repository uses the local commit identity `Barly Vallendito <22915547+barlydesign@users.noreply.github.com>`.
- RepoLearn is a separate project at `/Users/pavelclaw/Projects/Repo/repo-learn`, owned by the `repo-learn` organization. It currently uses GitHub CLI account `devrepostudio` and local commit identity `workrepostudio <workrepostudio@gmail.com>`.
- GitHub CLI account selection is global for `github.com`; always check the active account and repository remote before external GitHub writes. Never log out or remove the other project accounts as part of Rekann work.
- Do not store GitHub tokens, credentials, recovery codes, or other secrets in repository files or project documentation.

## Cloudflare ownership and local account routing

- Rekann deploys only to the Cloudflare account associated with `rekannapp@gmail.com`, account ID `f0f101bf2b8415c34b2a1589e4017295`.
- Use the Wrangler authentication profile `rekann`, which is bound locally to `/Users/pavelclaw/Projects/Rekann/rekann-app`. Verify the active profile and account with `corepack pnpm exec wrangler whoami` before remote Cloudflare writes.
- Keep the account ID in `wrangler.jsonc` as a target guard. The account ID is an identifier, not a credential.
- Production deploys use the GitHub `production` environment. After CI passes on `main`, GitHub Actions deploys the Worker with environment secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.
- Do not store OAuth credentials, API tokens, Global API Keys, passwords, recovery codes, or production secrets in the repository or project documentation.

## Neon ownership and local account routing

- Rekann uses the Neon organization `Rekann` (`org-weathered-term-87288143`) and project `Rekann App` (`bold-flower-53962598`) in `aws-ap-southeast-1`.
- Use the Neon CLI profile `rekann`. The repository `.neon` context pins the organization, project, and `production` database branch.
- Treat `.neon` identifiers as non-secret configuration. Keep connection strings, database passwords, API keys, and generated `.env` files out of Git and project documentation.
- Auth & Workspace review is complete for the scope in `docs/AUTH_WORKSPACE.md`. Development uses the `auth-development` database branch (`br-holy-feather-b33zppyv`), with runtime credentials in ignored `.dev.vars` and owner credentials in ignored `.env.migrations`. The existing `.neon` context still targets production: use an explicit development branch when retrieving CLI credentials.
- UI roles are Admin, optional Manager / HR, and Employee. Team is the directory label. Admin is scoped to one workspace, never a platform-wide superuser. Google sign-in stays disabled. All product copy is English. Figma reads use the local figma-cli daemon/bridge, not Figma MCP.

## Interaction styling

- Follow `docs/DESIGN_SYSTEM.md` for new components. Text-link and text-button hover states use subtle darker color instead of underlines. Use shared 160 ms ease-out color/background/border transitions for relevant interactive elements, visible keyboard focus, and reduced-motion support.
- Preserve semantic cursors: pointer for enabled clickable controls and selections, text for editable text fields, not-allowed for disabled controls, and progress for busy controls.

## Implementation discipline

- Apply the Ponytail decision ladder before adding code: skip work the task does not require; otherwise reuse the codebase, standard library, native platform features, and installed dependencies in that order before writing the smallest implementation that satisfies the request.
- Minimal implementation never removes validation, error handling, security controls, accessibility, or required verification.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:

- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
