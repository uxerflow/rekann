# Working on Rekann

Rekann is a lightweight people workspace for small teams. Notion is the canonical product source: https://app.notion.com/p/3cf86acb0f8080ce828dffb1a90e037a. Read the relevant PRD, SRS, and SDD before material implementation; local docs are navigation links.

- Discuss the project in Indonesian. Write source, comments, documentation, application copy, and validation text in English.
- The owner decides scope and accepts work. Claude Code is the primary implementation agent; Codex is the discussion, architecture, and independent QA partner, read-only by default unless the owner authorizes a specific implementation/setup task. Existing owner authorization applies within that scope.
- Work in small, reviewable phases. Do not add speculative abstractions, features, or dependencies. Current Phase 0 scope is the local application bootstrap only.
- Keep one repository and one application package: TanStack Start, React, strict TypeScript, Cloudflare Workers, Tailwind, and pnpm. Neon, Drizzle, Better Auth, R2, and Resend require later design review. Respect pinned versions and the lockfile.
- V1 covers people, attendance, time off, calendar, onboarding, documents, announcements, approvals, settings, dashboard, and basic reports/insights. Payroll, recruitment, performance reviews, expenses, assets, advanced scheduling/permissions, project management, daily reports, Telegram, AI, and enterprise workflows are out of scope.
- Future data follows User → Workspace Membership → Workspace. Scope every business record and protected operation to an authorized workspace; never trust client-supplied identity, role, or ownership.
- Enforce server-side authentication/authorization, boundary validation, least privilege, private documents, appropriate file-access expiry, transactional consistency, and abuse controls. Keep secrets out of Git, client code, logs, and documentation. The current bootstrap has no implemented authentication or data security.
- Do not manually edit generated route trees, Workers types, build output, or lockfiles. Use the responsible generator/package manager.
- For material changes, run frozen installation, build, typecheck, and relevant runtime/browser checks. Report actual evidence, risks, and checks not run. Add focused behavior tests when features warrant them.
- Deployment, migrations, remote writes, commits, and pushes require task-specific owner authorization. QA acceptance alone does not authorize release.
- Graphify, if introduced, is only an aid. When `graphify-out/graph.json` exists, query it for architecture/relationship questions and verify conclusions against source and Notion.

## GitHub ownership and local account routing

- Rekann is owned by the GitHub organization `uxerflow` and is managed through the personal account `barlydesign`. For GitHub operations in this repository, verify or switch GitHub CLI to `barlydesign` before creating repositories, pushing, or changing remote settings.
- The canonical Rekann remote is `https://github.com/uxerflow/rekann.git`. The owner authorized its public creation under Apache-2.0 on September 15, 2026.
- This repository uses the local commit identity `Barly Vallendito <22915547+barlydesign@users.noreply.github.com>`.
- RepoLearn is a separate project at `/Users/pavelclaw/Projects/Repo/repo-learn`, owned by the `repo-learn` organization. It currently uses GitHub CLI account `devrepostudio` and local commit identity `workrepostudio <workrepostudio@gmail.com>`.
- GitHub CLI account selection is global for `github.com`; always check the active account and repository remote before external GitHub writes. Never log out or remove the other project accounts as part of Rekann work.
- Do not store GitHub tokens, credentials, recovery codes, or other secrets in repository files or project documentation.
