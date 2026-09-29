import { and, eq, desc, gte, ne } from 'drizzle-orm'
import { compactBudgets } from './budget'
import type { Database, Transaction } from '../db'
import { aiMemory, aiTurn } from '../schema'
import { authorize, AppError } from '../workspaces'
import { aiMemoryInput, aiForgetInput, type AiContext } from '../../shared/ai'

type Db = Database | Transaction
const owner = (workspaceId: string, actor: string) =>
  and(eq(aiMemory.workspaceId, workspaceId), eq(aiMemory.actorId, actor))
export async function readMemory(db: Db, actor: string, workspaceId: string) {
  await authorize(db, actor, workspaceId)
  const [row] = await db.select().from(aiMemory).where(owner(workspaceId, actor))
  return row
    ? { enabled: row.enabled, notes: row.notes, version: row.version }
    : { enabled: true, notes: '', version: 0 }
}
export async function saveMemory(db: Database, actor: string, raw: unknown) {
  const p = aiMemoryInput.parse(raw)
  if (new TextEncoder().encode(p.notes).length > 1600)
    throw new AppError(
      400,
      'Keep your notes a little shorter so they stay useful in each conversation.',
    )
  return db.transaction(async (tx) => {
    await authorize(tx, actor, p.workspaceId, true)
    const current = await readMemory(tx, actor, p.workspaceId)
    if (current.version !== p.version)
      throw new AppError(409, 'Your memory changed. Reload it before saving.')
    const values = { enabled: p.enabled, notes: p.notes, version: p.version + 1 }
    await tx
      .insert(aiMemory)
      .values({ id: crypto.randomUUID(), workspaceId: p.workspaceId, actorId: actor, ...values })
      .onConflictDoUpdate({ target: [aiMemory.workspaceId, aiMemory.actorId], set: values })
    return values
  })
}
export async function forgetMemory(db: Database, actor: string, raw: unknown) {
  const p = aiForgetInput.parse(raw)
  return db.transaction(async (tx) => {
    await authorize(tx, actor, p.workspaceId, true)
    const current = await readMemory(tx, actor, p.workspaceId)
    if (current.version !== p.version)
      throw new AppError(409, 'Your memory changed. Reload it before clearing it.')
    const values = {
      enabled: current.enabled,
      notes: p.all ? '' : current.notes,
      version: current.version + 1,
    }
    await tx
      .insert(aiMemory)
      .values({ id: crypto.randomUUID(), workspaceId: p.workspaceId, actorId: actor, ...values })
      .onConflictDoUpdate({ target: [aiMemory.workspaceId, aiMemory.actorId], set: values })
    // Keep token accounting but remove content and invalidate every outstanding proposal.
    await tx
      .update(aiTurn)
      .set({ prompt: '', result: null, proposal: null, status: 'forgotten' })
      .where(and(eq(aiTurn.workspaceId, p.workspaceId), eq(aiTurn.actorId, actor)))
    return values
  })
}
export async function memoryContext(db: Db, actor: string, workspaceId: string, requestId: string) {
  const memory = await readMemory(db, actor, workspaceId)
  const context: AiContext = { notes: '', recentMessages: [] }
  if (!memory.enabled) return { version: memory.version, context }
  context.notes = memory.notes
  const rows = await db
    .select({ prompt: aiTurn.prompt })
    .from(aiTurn)
    .where(
      and(
        eq(aiTurn.workspaceId, workspaceId),
        eq(aiTurn.actorId, actor),
        ne(aiTurn.id, requestId),
        ne(aiTurn.status, 'forgotten'),
        gte(aiTurn.createdAt, new Date(Date.now() - 7 * 86400000)),
      ),
    )
    .orderBy(desc(aiTurn.createdAt))
    .limit(3)
  let bytes = 0
  for (const row of rows) {
    const size = new TextEncoder().encode(row.prompt).length
    if (bytes + size > 1200) break
    context.recentMessages.unshift(row.prompt)
    bytes += size
  }
  return { version: memory.version, context }
}

// Bounded cleanup keeps monthly token accounting without retaining old conversation text.
export async function compactMemory(
  db: Db,
  workspaceId?: string,
  actor?: string,
  now = new Date(),
) {
  const { lt, inArray } = await import('drizzle-orm')
  if (!workspaceId && !actor) await compactBudgets(db, now)
  const cutoff = new Date(now.getTime() - 7 * 86400000)
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const deletion = new Date(Math.min(cutoff.getTime(), month.getTime()))
  const scope = [
    workspaceId ? eq(aiTurn.workspaceId, workspaceId) : undefined,
    actor ? eq(aiTurn.actorId, actor) : undefined,
  ]
  const old = await db
    .select({ id: aiTurn.id })
    .from(aiTurn)
    .where(and(...scope, lt(aiTurn.createdAt, deletion)))
    .orderBy(aiTurn.createdAt)
    .limit(500)
  if (old.length)
    await db.delete(aiTurn).where(
      inArray(
        aiTurn.id,
        old.map((t) => t.id),
      ),
    )
  const text = await db
    .select({ id: aiTurn.id })
    .from(aiTurn)
    .where(and(...scope, lt(aiTurn.createdAt, cutoff), ne(aiTurn.prompt, '')))
    .orderBy(aiTurn.createdAt)
    .limit(500)
  if (text.length)
    await db
      .update(aiTurn)
      .set({ prompt: '', result: null, proposal: null, status: 'forgotten' })
      .where(
        inArray(
          aiTurn.id,
          text.map((t) => t.id),
        ),
      )
  return { removed: old.length, compacted: text.length }
}
