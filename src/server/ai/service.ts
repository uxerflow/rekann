import { readMemory, memoryContext, compactMemory } from './memory'
import {
  type AiPlatform,
  currentPolicy,
  platformOff,
  builtinAvailable,
  reservation,
  fundedUsage,
  reserveFunded,
  settleFunded,
} from './budget'
import { and, eq, gte, desc, sql, ne } from 'drizzle-orm'
import { z } from 'zod'
import type { Database, Transaction } from '../db'
import { aiSettings, aiTurn } from '../schema'
import { authorize, AppError, limitAction } from '../workspaces'
import { directoryEmployees } from '../directory'
import { authorizeEmployee, saveEmployee } from '../employees'
import { detailAccess, detailFields, detailAudit, patchEmployeeDetail } from '../employee-detail'
import { employeeFields, emptyEmployee } from '../../shared/employee-input'
import {
  aiSettingsInput,
  aiMessageInput,
  aiActionInput,
  aiModel,
  builtinModel,
  aiPlan,
  type AiPlan,
  type AiResult,
  type AiField,
} from '../../shared/ai'
import { checkKey, cryptKey, interpret, interpretBuiltin, type Interpret } from './provider'

type Db = Database | Transaction
const editable = ['department', 'jobTitle', 'employmentType', 'startDate'] as const
const creation = ['fullName', 'email', 'employeeNumber', ...editable] as const
const defaults = {
  funding: 'rekann' as const,
  enabled: true,
  encryptedKey: null,
  allowWrites: false,
  allowedRoles: ['admin', 'manager', 'employee'] as ('admin' | 'manager' | 'employee')[],
  monthlyTokens: 100000,
  dailyRequests: 30,
  version: 0,
}
const scope = z.object({ workspaceId: z.string().min(1).max(100) }).strict()
async function access(
  db: Db,
  actor: string,
  workspaceId: string,
  requireEnabled = true,
  lock = false,
  platform: AiPlatform = platformOff,
) {
  const auth = await authorize(db, actor, workspaceId, lock)
  const [stored] = await db.select().from(aiSettings).where(eq(aiSettings.workspaceId, workspaceId))
  const settings = stored || defaults
  const allowed =
    settings.enabled &&
    (settings.funding === 'rekann' ? builtinAvailable(platform) : !!settings.encryptedKey) &&
    settings.allowedRoles.includes(auth.employee.role) &&
    (auth.employee.role !== 'manager' || auth.company.managersEnabled)
  if (requireEnabled && !allowed)
    throw new AppError(403, 'AI is not enabled for your account. Your workspace admin can help.')
  return { ...auth, settings, allowed }
}
async function usage(db: Db, workspaceId: string, actor: string) {
  const today = new Date().toISOString().slice(0, 10)
  const [used] = await db
    .select({
      tokens: sql<number>`coalesce(sum(${aiTurn.tokens}),0)::integer`,
      requests: sql<number>`count(*) filter (where ${aiTurn.actorId}=${actor} and ${aiTurn.createdAt}>=${today}::date)::integer`,
    })
    .from(aiTurn)
    .where(
      and(
        eq(aiTurn.workspaceId, workspaceId),
        eq(aiTurn.funding, 'workspace'),
        gte(aiTurn.createdAt, new Date(today.slice(0, 7) + '-01')),
      ),
    )
  return { usedTokens: used.tokens, usedToday: used.requests }
}
export async function settingsView(
  db: Db,
  actor: string,
  workspaceId: string,
  platform: AiPlatform = platformOff,
) {
  const a = await access(db, actor, workspaceId, false, false, platform)
  const { encryptedKey, ...settings } = a.settings
  const used =
    settings.funding === 'rekann'
      ? await fundedUsage(db, workspaceId, actor)
      : await usage(db, workspaceId, actor)
  const dailyLimit =
    settings.funding === 'rekann' ? (await currentPolicy(db)).dailyRequests : settings.dailyRequests
  const nextReset = new Date()
  nextReset.setUTCHours(24, 0, 0, 0)
  return {
    ...settings,
    connected: settings.funding === 'rekann' ? builtinAvailable(platform) : !!encryptedKey,
    workspaceKeyConnected: !!encryptedKey,
    builtinAvailable: builtinAvailable(platform),
    unavailableReason: !settings.enabled
      ? ('paused' as const)
      : !settings.allowedRoles.includes(a.employee.role) ||
          (a.employee.role === 'manager' && !a.company.managersEnabled)
        ? ('restricted' as const)
        : settings.funding === 'rekann' && !builtinAvailable(platform)
          ? ('service' as const)
          : settings.funding === 'workspace' && !encryptedKey
            ? ('connection' as const)
            : null,
    workspaceKeyLimits: {
      monthlyTokens: settings.monthlyTokens,
      dailyRequests: settings.dailyRequests,
    },
    monthlyTokens: settings.funding === 'rekann' ? null : settings.monthlyTokens,
    dailyRequests: settings.funding === 'rekann' ? null : settings.dailyRequests,
    workspaceUsedToday: 0,
    admin: a.employee.role === 'admin',
    available: a.allowed,
    model: settings.funding === 'rekann' ? builtinModel : aiModel,
    ...used,
    requestAllowance: {
      limit: dailyLimit,
      remaining: Math.max(0, dailyLimit - used.usedToday),
      resetsAt: nextReset.toISOString(),
    },
  }
}
export async function saveSettings(
  db: Database,
  actor: string,
  raw: unknown,
  secret?: string,
  verifyKey = checkKey,
  platform: AiPlatform = platformOff,
) {
  const p = aiSettingsInput.parse(raw)
  const initial = await access(db, actor, p.workspaceId, false)
  if (initial.employee.role !== 'admin')
    throw new AppError(403, 'Only an admin can manage the AI connection.')
  await limitAction(db, actor, 'ai-settings', 3)
  let encryptedKey: string | undefined
  if (p.apiKey) {
    encryptedKey = await cryptKey(secret, p.workspaceId, p.apiKey)
    await verifyKey(p.apiKey)
  }
  return db.transaction(async (tx) => {
    const a = await access(tx, actor, p.workspaceId, false, true)
    if (a.employee.role !== 'admin')
      throw new AppError(403, 'Only an admin can manage the AI connection.')
    if (a.settings.version !== p.version)
      throw new AppError(409, 'AI settings changed. Reload them before saving.')
    const key = encryptedKey ?? a.settings.encryptedKey
    if (p.enabled && p.funding === 'workspace' && !key)
      throw new AppError(400, 'Add an API key to enable AI.')
    const values = {
      funding: p.funding,
      enabled: p.enabled,
      encryptedKey: key,
      allowedRoles: p.allowedRoles,
      allowWrites: p.allowWrites,
      monthlyTokens: p.monthlyTokens,
      dailyRequests: p.dailyRequests,
      version: p.version + 1,
    }
    await tx
      .insert(aiSettings)
      .values({ workspaceId: p.workspaceId, ...values })
      .onConflictDoUpdate({ target: aiSettings.workspaceId, set: values })
    await detailAudit(tx, p.workspaceId, actor, 'ai.settings_updated', p.workspaceId)
    return settingsView(tx, actor, p.workspaceId, platform)
  })
}
export async function disconnect(
  db: Database,
  actor: string,
  raw: unknown,
  platform: AiPlatform = platformOff,
) {
  const p = scope.parse(raw)
  return db.transaction(async (tx) => {
    const a = await access(tx, actor, p.workspaceId, false, true)
    if (a.employee.role !== 'admin') throw new AppError(403, 'Only an admin can disconnect AI.')
    await tx
      .update(aiSettings)
      .set({
        funding: 'rekann',
        enabled: true,
        encryptedKey: null,
        version: a.settings.version + 1,
      })
      .where(eq(aiSettings.workspaceId, p.workspaceId))
    await detailAudit(tx, p.workspaceId, actor, 'ai.workspace_key_removed', p.workspaceId)
    return settingsView(tx, actor, p.workspaceId, platform)
  })
}
const pick = (fields: Record<string, unknown>) =>
  Object.fromEntries(creation.map((k) => [k, String(fields[k] ?? '')])) as Record<AiField, string>
function fieldsOf(plan: AiPlan, update = false) {
  const fields: Partial<Record<AiField, string>> = {}
  for (const change of plan.changes) {
    if (update && !(editable as readonly string[]).includes(change.field))
      throw new AppError(400, 'Use the employee profile to change that information.')
    if (change.field in fields) throw new AppError(400, 'Please include each field only once.')
    fields[change.field] = change.value
  }
  return fields
}
function draftResult(
  proposal: NonNullable<typeof aiTurn.$inferSelect.proposal>,
  before: Partial<Record<AiField, string>>,
): AiResult {
  const required: AiField[] = ['fullName', 'email', 'employeeNumber', 'startDate']
  const missing =
    proposal.kind === 'create' ? required.filter((k) => !proposal.fields[k]?.trim()) : []
  return {
    message: missing.length
      ? 'Your draft is ready. Fill in the missing details, then review it before adding your employee.'
      : 'Please review these details. Nothing changes until you confirm.',
    draft: { kind: proposal.kind, fields: proposal.fields, before, missing },
  }
}
async function prepare(
  db: Db,
  actor: string,
  workspaceId: string,
  plan: AiPlan,
  allowWrites: boolean,
) {
  if (plan.action === 'unsupported')
    return {
      result: {
        message:
          'I can help you find people and manage employee work details in Rekann. What would you like to do with your team?',
      } as AiResult,
    }
  if (plan.action === 'clarify')
    return {
      result: {
        message:
          'Could you include the employee’s full name or email and what you’d like to find or change?',
      } as AiResult,
    }
  const writes = plan.action === 'create' || plan.action === 'update'
  if (writes && !allowWrites)
    throw new AppError(403, 'AI changes are turned off. You can still browse your team.')
  if (plan.action === 'create') {
    await authorizeEmployee(db, actor, workspaceId)
    const proposal = {
      kind: 'create' as const,
      targetId: crypto.randomUUID(),
      targetVersion: 0,
      snapshot: '',
      fields: fieldsOf(plan),
    }
    return { proposal, result: draftResult(proposal, {}) }
  }
  const all = (await directoryEmployees(db, actor, workspaceId)).filter(
    (p) => p.status !== 'removed',
  )
  const query = plan.query.toLocaleLowerCase()
  const rows = all.filter(
    (p) =>
      (!plan.department ||
        p.department?.toLocaleLowerCase() === plan.department.toLocaleLowerCase()) &&
      (!query ||
        [p.firstName + ' ' + p.lastName, p.email, p.employeeNumber, p.jobTitle].some((v) =>
          v?.toLocaleLowerCase().includes(query),
        )),
  )
  if (plan.action === 'update') {
    if (!query)
      return {
        result: {
          message: 'Who would you like to update? Include their full name, email, or employee ID.',
        },
      }
    const exact = rows.filter((p) =>
      [p.firstName + ' ' + p.lastName, p.email, p.employeeNumber].some(
        (v) => v?.toLocaleLowerCase() === query,
      ),
    )
    if (exact.length !== 1)
      return {
        result: {
          message:
            'Please use the employee’s exact full name, email, or ID so I can prepare the right change.',
        },
      }
    const a = await detailAccess(db, actor, workspaceId, exact[0].recordId || exact[0].id)
    if (!a.canEdit)
      throw new AppError(403, 'You do not have access to edit this employee’s work details.')
    const before = pick(await detailFields(db, a))
    const fields = fieldsOf(plan, true)
    if (!Object.keys(fields).length)
      return {
        result: {
          message:
            'What would you like to change? I can help with department, job title, employment type, or start date.',
        },
      }
    const proposal = {
      kind: 'update' as const,
      targetId: a.record?.id || a.member!.id,
      targetVersion: a.record?.version || 0,
      snapshot: JSON.stringify(before),
      fields,
    }
    return { proposal, result: draftResult(proposal, before) }
  }
  if (plan.action === 'count')
    return {
      result: {
        message: `There ${rows.length === 1 ? 'is 1 employee' : `are ${rows.length} employees`}${plan.department ? ` in ${plan.department}` : ' in your directory'}.`,
        total: rows.length,
      },
    }
  return {
    result: {
      message: rows.length
        ? `I found ${rows.length === 1 ? '1 employee' : `${rows.length} employees`}${rows.length > 20 ? '. Here are the first 20. Narrow your search to see more' : ''}.`
        : 'No matching employees yet. Try another name, email, or department.',
      total: rows.length,
      people: rows.slice(0, 20).map((p) => ({
        id: p.recordId || p.id,
        name: `${p.firstName} ${p.lastName}`.trim(),
        email: p.email,
        department: p.department || '',
        jobTitle: p.jobTitle,
      })),
    },
  }
}
function publicTurn(t: typeof aiTurn.$inferSelect) {
  return {
    id: t.id,
    prompt: t.prompt,
    status: t.status,
    version: t.version,
    result: t.result,
    createdAt: t.createdAt.toISOString(),
  }
}
async function visibleTurn(
  db: Db,
  actor: string,
  workspaceId: string,
  turn: typeof aiTurn.$inferSelect,
  visibleIds?: Set<string>,
) {
  const t = structuredClone(turn)
  if (t.result?.people) {
    const allowed =
      visibleIds ||
      new Set(
        (await directoryEmployees(db, actor, workspaceId))
          .filter((p) => p.status !== 'removed')
          .map((p) => p.recordId || p.id),
      )
    if (t.result.people.some((p) => !allowed.has(p.id))) {
      t.result = {
        message: 'Your directory access has changed. Run this search again for current results.',
      }
    }
  }
  if (t.status === 'draft' || t.result?.savedId) {
    try {
      if (t.proposal?.kind === 'create') await authorizeEmployee(db, actor, workspaceId)
      else {
        const id = t.proposal?.targetId || t.result?.savedId
        if (id && !(await detailAccess(db, actor, workspaceId, id)).canEdit) throw new Error()
      }
    } catch {
      t.result = { message: 'These details are no longer available to your account.' }
      t.status = 'unavailable'
    }
  }
  if (t.status === 'pending' && Date.now() - t.createdAt.getTime() > 60000) {
    t.status = 'failed'
    t.result = { message: 'This request was interrupted. Please send it again.' }
  }
  return publicTurn(t)
}
export async function history(
  db: Database,
  actor: string,
  workspaceId: string,
  platform: AiPlatform = platformOff,
) {
  await access(db, actor, workspaceId, true, false, platform)
  const rows = await db
    .select()
    .from(aiTurn)
    .where(
      and(
        eq(aiTurn.workspaceId, workspaceId),
        eq(aiTurn.actorId, actor),
        ne(aiTurn.status, 'forgotten'),
        gte(aiTurn.createdAt, new Date(Date.now() - 7 * 86400000)),
      ),
    )
    .orderBy(desc(aiTurn.createdAt))
    .limit(20)
  const visibleIds = rows.some((t) => t.result?.people)
    ? new Set(
        (await directoryEmployees(db, actor, workspaceId))
          .filter((p) => p.status !== 'removed')
          .map((p) => p.recordId || p.id),
      )
    : undefined
  return Promise.all(rows.reverse().map((t) => visibleTurn(db, actor, workspaceId, t, visibleIds)))
}
export async function message(
  db: Database,
  actor: string,
  raw: unknown,
  secret?: string,
  run?: Interpret,
  signal?: AbortSignal,
  platform: AiPlatform = platformOff,
) {
  const p = aiMessageInput.parse(raw)
  if (new TextEncoder().encode(p.message).length > 8000)
    throw new AppError(400, 'Please keep your message shorter.')
  await limitAction(db, actor, 'ai-message', 5)
  const reservationResult = await db.transaction(async (tx) => {
    const a = await access(tx, actor, p.workspaceId, true, true, platform)
    await compactMemory(tx, p.workspaceId, actor)
    const [existing] = await tx.select().from(aiTurn).where(eq(aiTurn.id, p.requestId))
    if (existing) {
      if (existing.actorId !== actor || existing.workspaceId !== p.workspaceId)
        throw new AppError(404, 'Request not found.')
      if (existing.prompt !== p.message)
        throw new AppError(409, 'Please send this as a new request.')
      return { existing, settings: a.settings }
    }
    const now = new Date()
    if (a.settings.funding === 'workspace') {
      const used = await usage(tx, p.workspaceId, actor)
      if (
        used.usedToday >= a.settings.dailyRequests ||
        used.usedTokens + reservation > a.settings.monthlyTokens
      )
        throw new AppError(
          429,
          'You’ve reached your AI limit. Your admin can review the usage settings.',
        )
    }
    const [pending] = await tx
      .select({ id: aiTurn.id })
      .from(aiTurn)
      .where(
        and(
          eq(aiTurn.workspaceId, p.workspaceId),
          eq(aiTurn.actorId, actor),
          eq(aiTurn.status, 'pending'),
          gte(aiTurn.createdAt, new Date(Date.now() - 60000)),
        ),
      )
      .limit(1)
    if (pending) throw new AppError(409, 'Please wait for your current request to finish.')
    if (a.settings.funding === 'rekann') await reserveFunded(tx, p.workspaceId, actor, now)
    await tx.insert(aiTurn).values({
      id: p.requestId,
      workspaceId: p.workspaceId,
      actorId: actor,
      prompt: p.message,
      settingsVersion: a.settings.version,
      funding: a.settings.funding,
      createdAt: now,
    })
    return {
      settings: a.settings,
      memory: await memoryContext(tx, actor, p.workspaceId, p.requestId),
    }
  })
  if (reservationResult.existing)
    return visibleTurn(db, actor, p.workspaceId, reservationResult.existing)
  let tokens = reservation
  try {
    const included = reservationResult.settings.funding === 'rekann'
    const context = reservationResult.memory?.context
    const operation = included
      ? run
        ? run('', p.message, signal, context)
        : interpretBuiltin(platform.AI!, p.message, signal, context)
      : (run ?? interpret)(
          await cryptKey(secret, p.workspaceId, reservationResult.settings.encryptedKey!, true),
          p.message,
          signal,
          context,
        )
    const response = await operation.catch((error) => {
      // Workspace admins cannot repair platform billing or credentials.
      if (
        reservationResult.settings.funding === 'rekann' &&
        error instanceof AppError &&
        error.status === 503
      )
        throw new AppError(503, 'Rekann AI is unavailable right now. Please try again shortly.')
      throw error
    })
    const plan = aiPlan.parse(response.plan)
    tokens =
      Number.isSafeInteger(response.tokens) && response.tokens > 0 && response.tokens <= reservation
        ? response.tokens
        : reservation
    return await db.transaction(async (tx) => {
      const a = await access(tx, actor, p.workspaceId, true, true, platform)
      if (a.settings.version !== reservationResult.settings.version)
        throw new AppError(409, 'AI settings changed. Please send your request again.')
      const [current] = await tx.select().from(aiTurn).where(eq(aiTurn.id, p.requestId))
      if (current.status !== 'pending') return publicTurn(current)
      if (
        (await readMemory(tx, actor, p.workspaceId)).version !== reservationResult.memory?.version
      )
        throw new AppError(409, 'Your memory changed. Please send your request again.')
      const prepared = await prepare(tx, actor, p.workspaceId, plan, a.settings.allowWrites)
      const [saved] = await tx
        .update(aiTurn)
        .set({
          result: prepared.result,
          proposal: prepared.proposal || null,
          status: prepared.proposal ? 'draft' : 'done',
          tokens,
        })
        .where(eq(aiTurn.id, p.requestId))
        .returning()
      if (current.funding === 'rekann')
        await settleFunded(tx, p.workspaceId, actor, current.createdAt, tokens)
      return publicTurn(saved)
    })
  } catch (error) {
    const text =
      error instanceof AppError
        ? error.message
        : 'I couldn’t finish that request. Please try again.'
    await db
      .update(aiTurn)
      .set({ status: 'failed', result: { message: text }, tokens })
      .where(and(eq(aiTurn.id, p.requestId), eq(aiTurn.status, 'pending')))
    // Authorization can change while the provider is running. Do not return prior results.
    await access(db, actor, p.workspaceId, true, false, platform)
    const [saved] = await db.select().from(aiTurn).where(eq(aiTurn.id, p.requestId))
    return publicTurn(saved)
  }
}
export async function action(
  db: Database,
  actor: string,
  raw: unknown,
  platform: AiPlatform = platformOff,
) {
  const p = aiActionInput.parse(raw)
  return db.transaction(async (tx) => {
    const a = await access(tx, actor, p.workspaceId, true, true, platform)
    const [t] = await tx
      .select()
      .from(aiTurn)
      .where(
        and(eq(aiTurn.id, p.id), eq(aiTurn.workspaceId, p.workspaceId), eq(aiTurn.actorId, actor)),
      )
    if (!t) throw new AppError(404, 'Draft not found.')
    if (p.action === 'cancel' && ['pending', 'draft'].includes(t.status)) {
      const [saved] = await tx
        .update(aiTurn)
        .set({
          status: 'cancelled',
          proposal: null,
          result: { message: 'Cancelled. No employee details were changed.' },
          version: t.version + 1,
        })
        .where(eq(aiTurn.id, t.id))
        .returning()
      return publicTurn(saved)
    }
    if (t.status === 'confirmed' && p.action === 'confirm') return publicTurn(t)
    if (t.status !== 'draft' || !t.proposal)
      throw new AppError(409, 'This draft is no longer available. Please start a new request.')
    if (t.version !== p.version)
      throw new AppError(409, 'This draft changed. Reload it before confirming.')
    if (!a.settings.allowWrites || a.settings.version !== t.settingsVersion)
      throw new AppError(409, 'AI settings changed. Please prepare a new draft.')
    if (Date.now() - t.createdAt.getTime() > 30 * 60000)
      throw new AppError(409, 'This draft has expired. Please prepare a new one.')
    const proposal = t.proposal
    let before: Partial<Record<AiField, string>> = {}
    if (proposal.kind === 'create') await authorizeEmployee(tx, actor, p.workspaceId)
    else {
      const employee = await detailAccess(tx, actor, p.workspaceId, proposal.targetId)
      if (!employee.canEdit)
        throw new AppError(403, 'You no longer have access to edit this employee.')
      before = pick(await detailFields(tx, employee))
      if (
        (employee.record?.version || 0) !== proposal.targetVersion ||
        JSON.stringify(before) !== proposal.snapshot
      )
        throw new AppError(409, 'This employee’s details changed. Please prepare a fresh draft.')
    }
    if (p.action === 'revise') {
      if (!p.changes) throw new AppError(400, 'Include the details to update.')
      proposal.fields = fieldsOf(
        { action: proposal.kind, changes: p.changes, query: '', department: '' } as AiPlan,
        proposal.kind === 'update',
      )
      if (!Object.keys(proposal.fields).length)
        throw new AppError(400, 'Include at least one field.')
      const [saved] = await tx
        .update(aiTurn)
        .set({ proposal, result: draftResult(proposal, before), version: t.version + 1 })
        .where(eq(aiTurn.id, t.id))
        .returning()
      return publicTurn(saved)
    }
    if (p.changes) throw new AppError(400, 'Review your updated draft before confirming.')
    if (proposal.kind === 'create') {
      const fields = employeeFields.parse({ ...emptyEmployee, ...proposal.fields })
      await saveEmployee(tx, actor, {
        workspaceId: p.workspaceId,
        id: proposal.targetId,
        version: 0,
        status: 'ready',
        fields,
      })
    } else {
      await patchEmployeeDetail(tx, actor, {
        workspaceId: p.workspaceId,
        id: proposal.targetId,
        version: proposal.targetVersion,
        section: 'work',
        fields: proposal.fields,
      })
    }
    await detailAudit(
      tx,
      p.workspaceId,
      actor,
      `ai.employee_${proposal.kind === 'create' ? 'created' : 'updated'}`,
      proposal.targetId,
    )
    const [saved] = await tx
      .update(aiTurn)
      .set({
        status: 'confirmed',
        version: t.version + 1,
        proposal: null,
        result: {
          message:
            proposal.kind === 'create'
              ? 'Your employee has been added. You can send an invitation from their profile when you’re ready.'
              : 'The employee’s work details have been updated.',
          savedId: proposal.targetId,
        },
      })
      .where(eq(aiTurn.id, t.id))
      .returning()
    return publicTurn(saved)
  })
}
