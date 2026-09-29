import { and, eq, inArray, lt, sql } from 'drizzle-orm'
import type { Database, Transaction } from '../db'
import type { AppConfig } from '../config'
import { aiBudget, user, workspaceMember } from '../schema'
import { AppError } from '../workspaces'

export type AiPlatform = Pick<AppConfig, 'REKANN_AI_ENABLED'> & { AI?: Pick<Ai, 'run'> }
export const platformOff: AiPlatform = { REKANN_AI_ENABLED: 'false' }
export const reservation = 16384
// Platform policy, never accepted from workspace settings or request bodies.
// Count unique verified members, not memberships or waitlist signups. These tiers
// are internal fair-use ceilings; the shared pool remains the ultimate spending bound.
export function includedPolicy(people: number) {
  if (people <= 100) return { monthlyTokens: 65536, dailyRequests: 5, workspaceDailyRequests: 15 }
  if (people <= 200) return { monthlyTokens: 49152, dailyRequests: 3, workspaceDailyRequests: 10 }
  if (people <= 1000) return { monthlyTokens: 32768, dailyRequests: 2, workspaceDailyRequests: 5 }
  return { monthlyTokens: 32768, dailyRequests: 1, workspaceDailyRequests: 3 }
}
export async function currentPolicy(db: Database | Transaction) {
  const members = await db
    .selectDistinct({ id: user.id })
    .from(user)
    .innerJoin(workspaceMember, eq(workspaceMember.userId, user.id))
    .where(and(eq(user.emailVerified, true), eq(workspaceMember.status, 'active')))
    .limit(1001)
  return includedPolicy(members.length)
}
const platformMonthlyTokens = 1000000
// Llama 3.1 8B FP8 fast: at most 0.034868 neurons/token, counting every token at the
// higher output rate. This pool bounds this environment to ~2,286 neurons/day.
// Other environments/account workloads must have separately allocated budgets.
export const platformDailyTokens = 65536
export function builtinAvailable(platform: AiPlatform) {
  return platform.REKANN_AI_ENABLED === 'true' && typeof platform.AI?.run === 'function'
}
function buckets(workspaceId: string, actor: string, now: Date, limits = includedPolicy(0)) {
  const day = now.toISOString().slice(0, 10)
  const month = day.slice(0, 7) + '-01'
  return [
    { id: `platform:${month}`, period: month, tokens: platformMonthlyTokens, requests: null },
    {
      id: `workspace:${workspaceId}:${month}`,
      period: month,
      tokens: limits.monthlyTokens,
      requests: null,
    },
    {
      id: `person-day:${actor}:${day}`,
      period: day,
      tokens: null,
      requests: limits.dailyRequests,
    },
    {
      id: `workspace-day:${workspaceId}:${day}`,
      period: day,
      tokens: null,
      requests: limits.workspaceDailyRequests,
    },
    { id: `platform-day:${day}`, period: day, tokens: platformDailyTokens, requests: null },
  ]
}
export async function fundedUsage(db: Database | Transaction, workspaceId: string, actor: string) {
  const keys = buckets(workspaceId, actor, new Date())
  // Never expose platform totals or another user's usage to a workspace.
  const rows = await db
    .select()
    .from(aiBudget)
    .where(
      inArray(
        aiBudget.id,
        keys.slice(1, 4).map((k) => k.id),
      ),
    )
  const value = (index: number) => rows.find((r) => r.id === keys[index].id)
  return {
    usedTokens: value(1)?.tokens || 0,
    usedToday: value(2)?.requests || 0,
    workspaceUsedToday: value(3)?.requests || 0,
  }
}
export async function reserveFunded(
  tx: Transaction,
  workspaceId: string,
  actor: string,
  now: Date,
) {
  // All reservations acquire the global bucket first. Upserts serialize concurrent workspaces.
  // Throwing rolls back every bucket along with the turn, before any provider request.
  const limits = await currentPolicy(tx)
  for (const bucket of buckets(workspaceId, actor, now, limits)) {
    const [used] = await tx
      .insert(aiBudget)
      .values({ id: bucket.id, period: bucket.period, tokens: reservation, requests: 1 })
      .onConflictDoUpdate({
        target: aiBudget.id,
        set: {
          tokens: sql`${aiBudget.tokens} + ${reservation}`,
          requests: sql`${aiBudget.requests} + 1`,
        },
      })
      .returning()
    if (
      (bucket.tokens !== null && used.tokens > bucket.tokens) ||
      (bucket.requests !== null && used.requests > bucket.requests)
    )
      throw new AppError(
        429,
        bucket.id.startsWith('platform-day:')
          ? 'Rekann AI has reached its shared allowance for today. Please try again tomorrow or use a workspace key.'
          : bucket.id.startsWith('platform:')
            ? 'Rekann AI has reached its shared allowance for this month. Please try again next month or ask your admin about a workspace key.'
            : 'You’ve reached the included AI allowance. Daily limits reset tomorrow and monthly limits reset next month, in UTC. Your admin can also connect a workspace key.',
      )
  }
}
export async function settleFunded(
  tx: Transaction,
  workspaceId: string,
  actor: string,
  now: Date,
  tokens: number,
) {
  // Called once, in the same transaction that completes a pending turn. Uncertain failures
  // and cancelled/forgotten requests retain the full reservation conservatively.
  for (const bucket of buckets(workspaceId, actor, now))
    await tx
      .update(aiBudget)
      .set({ tokens: sql`${aiBudget.tokens} - ${reservation - tokens}` })
      .where(and(eq(aiBudget.id, bucket.id), sql`${aiBudget.tokens} >= ${reservation - tokens}`))
}
export async function compactBudgets(db: Database | Transaction, now = new Date()) {
  // Keep the current and previous month so a request crossing midnight can still settle.
  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    .toISOString()
    .slice(0, 10)
  const rows = await db
    .select({ id: aiBudget.id })
    .from(aiBudget)
    .where(lt(aiBudget.period, cutoff))
    .orderBy(aiBudget.period)
    .limit(500)
  if (rows.length)
    await db.delete(aiBudget).where(
      inArray(
        aiBudget.id,
        rows.map((r) => r.id),
      ),
    )
}
