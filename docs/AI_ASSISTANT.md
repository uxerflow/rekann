# Rekann AI

Owner-authorized development scope, September 27, 2026. This supersedes the earlier AI exclusion and the September 18 provider/read-only direction for this slice only. Production remains the waitlist; this work has not been deployed to staging.

## Available flow

Open `/w/:slug/ai` or the dashboard Assistant. A workspace without saved AI settings defaults to included Rekann AI, enabled for all active roles with read-only Team Directory tools. It becomes available when the platform owner activates the server connection; users do not perform workspace setup. Existing explicitly saved settings and pauses remain respected. Current membership, optional manager enablement and directory visibility still apply.

**AI settings** offers Rekann AI or an optional workspace OpenRouter key. Selecting a connection clears the pause state in the form; Save applies it. Access and permissions are collapsed, writes remain off by default, and admins can pause AI for the workspace. Removing a workspace key returns to included Rekann AI. Workspace-key usage controls are collapsed under **Usage limits**, with grouped whole numbers such as `100,000`; they are not monetary amounts. Included budget tiers stay server-side. A missing platform connection shows a neutral availability card, not an account-setup error. The composer model dropdown is separate from AI settings. It lists the currently supported model: Rekann AI for the included connection, or GPT-4.1 mini for the workspace key. Each connection uses its fixed server-approved model; this does not expose arbitrary model IDs or change workspace funding. The model menu also has an OWN AI PROVIDER section: admins can connect or manage the workspace key, while other roles see a disabled admin hint. Connection management remains in the top-right AI settings. A compact personal request allowance shows remaining requests, the current daily ceiling and the UTC reset time. It refreshes when the menu opens and after a request; shared service/workspace limits may still stop requests earlier. The option list reserves a scrollbar gutter only when it overflows; a single model has no scrollbar.

The workspace-key connection test validates the key with OpenRouter; model availability is verified by the first actual request.

Included Rekann AI uses Cloudflare Workers AI through the `AI` binding with `@cf/meta/llama-3.1-8b-instruct-fp8-fast`. The optional workspace OpenRouter connection uses `openai/gpt-4.1-mini`. No new dependencies, vector store, graph service, or external memory platform were introduced.

- Search employees by name, work email, employee ID, job title, or department; count permitted directory entries. Results are limited to 20 and use existing directory visibility.
- Prepare one new employee, fill missing details, and explicitly confirm. Creation makes a ready employee record, never an invitation or account.
- Prepare changes to department, job title, employment type, or start date. Existing detail-edit permissions apply; confirmation rechecks permission, settings, record version and the original work-field snapshot.
- No arbitrary SQL, shell, URLs, files, invitations, deletions, role changes, bulk actions, private records or other HR modules are exposed as model operations.

Responses and action cards are rendered from validated structured intent and live server results. English copy is concise and conversational. The model may understand other input languages; localized replies are not implemented.

## Data and execution boundary

Each request authenticates the current user, derives membership from the database, and scopes every operation to that workspace. Client-supplied actor IDs or roles are rejected. Administrators are workspace administrators, never cross-workspace operators. Removed membership or disabled manager access blocks AI.

The provider gets the current user message and optional bounded private context. It does not get employee records, personal/contact records, documents, database credentials, provider keys inside prompts, other users' chat, or tool results. Users can still put personal information in their own messages; the Your memory dialog names Cloudflare Workers AI for included usage or OpenRouter for workspace-key usage. OpenRouter routing denies providers that collect data. Cloudflare requests do not enable AI Gateway logging. This is not a claim of zero retention across every service.

The included adapter calls only the pinned Workers AI model. The workspace-key adapter reaches only fixed OpenRouter HTTPS endpoints. Output must satisfy a strict Zod schema with an action/field allowlist. System instructions are guidance, not the security boundary. The backend independently chooses permitted operations and validates all writes. Model or memory text cannot confirm writes.

Writes use the existing employee services in the same transaction as confirmation and audit. Workspace locking serializes permission changes, budget reservations, and confirmations. Duplicate confirmation does not create another employee. Drafts expire after 30 minutes. Stop cancels pending proposals; delayed provider results cannot restore cancelled or forgotten requests.

## Private memory and storage limits

Memory is private to `(workspace_id, actor_id)`, including when two users are both admins. It is not a shared company knowledge base. A user in multiple workspaces gets distinct notes and conversation context. Notes are saved explicitly through **Your memory**, not inferred and silently persisted by the model.

- One notes row per user/workspace, with a unique database index. Notes are at most 1,000 characters and 1,600 UTF-8 bytes. This describes the text payload, not total PostgreSQL row/index overhead.
- At most three recent user messages from the same user/workspace, at most 1,200 UTF-8 bytes combined, within seven days. No generated answers or directory results are replayed to the provider. Large recent messages are omitted rather than silently truncated into misleading fragments.
- **Use my notes and recent messages** disables both sources when off. Notes can explain company terminology. An unambiguous follow-up can refer to a person named in recent user messages; ambiguous targets require clarification. Names resolved from context still pass current database access checks and review.
- **Clear conversation** removes stored prompt/result/proposal text and cancels outstanding drafts while retaining explicit notes. **Forget everything** also clears notes. These operations preserve token accounting and do not undo employee changes already confirmed.
- UI history shows at most 20 turns within seven days. Cleanup redacts text older than seven days and deletes turns older than both the seven-day history window and the current UTC month. Monthly usage rows survive with no conversation content until they are no longer needed. Explicit notes remain until edited, cleared, or workspace/user deletion cascades.
- Maintenance processes at most 500 deletions and 500 redactions per run, using a retention index. App Worker configuration schedules it hourly; waitlist keeps its separate delivery cron. Development also compacts the current user's old turns before a new message. Scheduled maintenance starts only after an app deployment; retention can lag while jobs are unavailable. No AI calls are made for cleanup or summarization.

Clearing notes cannot retract messages already transmitted to a provider. Browser sessions may retain their already-rendered view until refreshed; server access and new context use the cleared state.

## Cost controls

One model call per request, no autonomous tool loop. Backend queries, counts, rendering, memory CRUD and cleanup consume no model tokens. Provider output is capped at 1,000 tokens; serialized request body is capped at 14,000 UTF-8 bytes. Model responses are bounded to 32 KB and 20 seconds.

Before inference, reserve 16,384 tokens under the workspace lock. Replace the reservation with reported usage after a validated response; uncertain failures retain the reservation. Cancellation can also retain the reservation. This intentionally favors a conservative cap over undercounting. Replaying the same request ID does not call the provider again. Daily per-user request caps and a five-per-minute request rate limit complement the monthly shared workspace budget. OpenRouter charges vary; token limits are not an exact dollar budget or an estimate of average request size.

Provider keys are encrypted with AES-GCM and a server-only 32-byte `AI_ENCRYPTION_KEY`; workspace ID is authenticated encryption context. Never return the key, ciphertext, or raw upstream errors. Losing/rotating the server key requires a managed re-encryption or reconnecting workspace provider keys.

## Configuration and release

Migrations 0010–0013 were applied to the isolated development branch only. The local encryption secret is in ignored `.dev.vars`; `.env.example` documents generation without storing a secret. Staging requires these migrations and its own encryption secret for workspace keys before deployment. Included AI uses the Cloudflare `AI` binding and `REKANN_AI_ENABLED=true`; no platform OpenRouter key exists. The app's local configuration uses a remote AI binding, so inference consumes the Rekann Cloudflare account allowance even on localhost. Development is enabled. The default deployment kill switch remains off, and staging has no AI binding yet. Future deployment must allocate a separate daily pool or use shared accounting before enabling more environments. Do not alter the production waitlist Worker, domain, or database for this feature.

Live OpenRouter inference has not been tested with an owner-supplied key. Automated tests inject a structured interpreter at the service boundary and test the fixed provider transport separately. Browser tests use the real authenticated HTTP API and development database for review, confirmation, settings, memory, and profile navigation. This proves application integration, not live model interpretation quality. Real-key acceptance should include English/Indonesian phrasing, ambiguous follow-ups, company aliases, out-of-scope requests, provider-credit errors and inference latency.

Future scope requires a separate decision: shared company memory with explicit publish permissions, automatic extraction with user review, other HR modules, attachments, broad semantic retrieval, configurable models or localized replies.

## Development and staging budget allocation — September 29

The owner authorized the preview staging release. Development and staging each receive an independent pool of 65,536 tokens per UTC day and 1,000,000 per UTC month, enforced by their separate database ledgers. The combined daily allocation is 131,072 tokens; this is an explicit allocation for these two environments, not a shared counter. No third environment is enabled by this release. The default production kill switch stays off and the public waitlist has no AI binding.

The pinned model pricing was rechecked against [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) on September 29: 4,119 neurons per million input tokens and 34,868 per million output tokens. Counting all allocated tokens at the higher output rate bounds these two pools to approximately 4,571 neurons/day combined. Other Cloudflare workloads are outside this application ledger; another deployment requires an explicit allocation review. Existing request reservations, adaptive person/workspace limits and no-fallback behavior are unchanged.

## Verification recorded

- Frozen dependency installation, TypeScript check and production build passed.
- Twenty-one focused AI tests cover encrypted key isolation, role/workspace checks, create/edit confirmation, concurrent confirmation, quotas, malformed model output, provider limits, private memory, forgetting during inference, retention, expiry and settings changes.
- Existing unit suites passed alongside the AI tests during development, including Team Directory, employee details and waitlist behavior.
- A real-browser test on the isolated development database covers connection settings, private notes, draft correction, explicit save, employee navigation, Assistant drawer, forgetting content and disconnect. Narrow layouts at 320 and 390 pixels do not overflow horizontally.
- Desktop screenshots were reviewed against the Figma idle layout; controls reuse the app components. Memory/settings are additional scope approved during implementation. The compact toolbar was adjusted after visual review.
- Client build scan found no encryption-key binding name, encrypted-key column or server interpreter instructions in the client output. This is a focused check, not a guarantee against every possible security issue.

## Rekann-funded AI boundary

Implemented in development after owner authorization on September 27. The same Team Directory action allowlist, private memory, role checks, explicit confirmation and response bounds apply to both funding modes. No new feature access is granted by choosing a different key. Each turn records its funding source; existing rows remain workspace-funded after migration. Switching connection increments the settings version and invalidates outstanding drafts. Provider failures never fall back to a different key.

Included policy lives only in `src/server/ai/budget.ts`. The shared ceiling is 1,000,000 tokens per UTC month and 65,536 per UTC day in this environment. Every funded request reads the current population of unique verified users with an active workspace membership, capped at 1,001 rows because higher values share one tier. Multiple memberships count once; invitations, waitlist signups, unverified accounts and removed memberships do not count. This is the eligible platform population, not a count of paying customers or concurrent sessions.

| Verified active members | Requests/person/day across workspaces | Requests/workspace/day | Tokens/workspace/month |
| ----------------------- | ------------------------------------- | ---------------------- | ---------------------- |
| Up to 100               | 5                                     | 15                     | 65,536                 |
| 101–200                 | 3                                     | 10                     | 49,152                 |
| 201–1,000               | 2                                     | 5                      | 32,768                 |
| Above 1,000             | 1                                     | 3                      | 32,768                 |

The policy is evaluated before reservation; crossing a threshold can reduce the remaining allowance immediately, without resetting usage. The monthly workspace floor is twice the maximum request reservation, leaving room for follow-ups after the first request settles. A floor equal to one reservation would effectively block a second request even when the first used only a few tokens. These are conservative fair-use ceilings within a shared pool, not guaranteed equal allocations. Many active workspaces can exhaust the shared pool before reaching individual ceilings; the service then stops included calls rather than raising spend. Policy changes do not grant more feature access.

These are development guardrails, not published plan allowances or pricing promises. Workspace admins cannot change included policy. Population counts, adaptive tiers and shared pool totals remain server-only. At the owner’s request, the settings API exposes the authenticated person’s current daily request limit, remaining requests and next reset, shown in the model menu. This is a current fair-use ceiling, not a guaranteed allocation. Stored admin-configurable limits apply only to workspace-key usage. Strict payload schemas reject platform-limit or per-message funding overrides. The platform owner changes policy in server code and can disable funded access through `REKANN_AI_ENABLED=false`. There is no public platform-admin API or superuser UI.

Funded accounting uses a small aggregate table: one global daily bucket, one global monthly bucket, one monthly bucket per active workspace, one daily bucket per active user, and one daily bucket per active workspace. Buckets contain opaque IDs, a period, token counts and request counts only. They have no cascading foreign keys, so deleting a workspace, disconnecting, changing funding or forgetting conversation content cannot reset shared accounting. No extra prompts or employee data are copied into the table. Current and previous UTC months are retained for boundary-crossing requests, with at most 500 old buckets deleted per hourly maintenance run. Retention can lag if scheduled maintenance is unavailable.

Before calling the provider, a transaction reserves 16,384 tokens in every bucket. Global-first upserts serialize competing reservations across workspaces, and any failed limit check rolls back every counter and the turn. The transaction closes before inference. Successful completion settles the original reservation period to validated usage in the same transaction as the pending turn update, exactly once. Uncertain failures, interrupted calls, cancelled or forgotten turns keep the full reservation. Included accounting reads these aggregate counters; workspace-key usage continues to use its own filtered turn accounting. The simplified settings UI only shows explicit usage numbers for a connected workspace key. Retries with the same request ID do not reserve again or call the provider again.

Counters never expose platform usage or another user’s usage to a workspace. The settings API can return the caller’s own daily included count across workspaces and current workspace totals, but never exposes the population or adaptive limits. A shared cap also limits abuse through multiple new accounts; user quotas alone are not a defense against coordinated account creation. The pinned FP8-fast model costs 4,119 neurons per million input tokens and 34,868 per million output tokens according to [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) checked September 27, 2026. Counting **all** tokens at the higher output rate, 65,536 tokens bounds this pool to about 2,286 neurons/day. The free account allocation is 10,000 neurons/day; it is shared with other environments and account workloads. This app ledger cannot cap unrelated Cloudflare workloads or hosting/database/storage costs. Recheck model rates and aggregate deployment budgets before release. No automatic retries or cross-provider fallback are enabled.

Tests cover locked quotas, all five buckets, concurrent reservations, cross-workspace user limits, deletion/forgetting, connection switching, duplicate requests, UTC rollover, retention, kill switch, missing configuration, no fallback, provider failures and confirmed writes. PostgreSQL behavior tests use PGlite; the browser flow uses the isolated Neon dev database. Live included inference is verified separately with an explicit opt-in development test; OpenRouter live inference still needs a workspace-owned key.

September 27 UX refinement: neutral availability banner, default included connection, compact settings sections, advanced workspace-key limits, grouped numeric formatting, and AI dialog scrollbars in the outer gutter. Browser checks cover desktop and narrow viewports, field-to-scrollbar separation, visible modal actions and formatted input. No new migration is needed for service defaults or budget policy. Included requests use Cloudflare Workers AI. OpenRouter applies only to workspace keys configured in the app.

Composer refinement: disabled attachment button, clickable Team directory context menu with other contexts disabled, and shared keyboard-accessible model/context dropdowns. Textarea has a transparent surface in enabled, focused and disabled states, without the native resize handle. Provider disclosure lives in Your memory instead of a repeated caption. The provider correction removes the platform OpenRouter key requirement; users get included Cloudflare AI without workspace setup.

Live development acceptance (September 27): included Cloudflare inference succeeded through the authenticated application API without workspace settings or a workspace key. English and Indonesian directory-count requests returned the real synthetic workspace count. The English request took about 6.4 seconds including application/database work and used 353 tokens. Twenty-one AI tests and both browser/integration flows passed, alongside typecheck and build. This is a smoke test, not a latency benchmark or full language-quality evaluation. No staging or production deployment was performed.
