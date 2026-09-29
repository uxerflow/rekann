import { test, expect } from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import * as schema from '../src/server/schema'
import type { Database } from '../src/server/db'
import {
  action,
  message,
  history,
  saveSettings,
  settingsView,
  disconnect,
} from '../src/server/ai/service'
import { cryptKey, interpret, interpretBuiltin, type Interpret } from '../src/server/ai/provider'
import type { AiPlan } from '../src/shared/ai'

const secret = Buffer.alloc(32, 7).toString('base64')
const key = 'test-provider-key-not-a-real-credential'
const plan = (action: AiPlan['action'], changes: AiPlan['changes'] = [], query = ''): AiPlan => ({
  action,
  changes,
  query,
  department: '',
})
async function fixture() {
  const pg = new PGlite()
  for (const file of [
    '0000_thankful_groot',
    '0001_workspace_slug',
    '0003_require_workspace_slug',
    '0006_cuddly_stature',
    '0007_red_ser_duncan',
    '0009_open_junta',
    '0010_perpetual_shadow_king',
    '0011_fuzzy_luke_cage',
    '0012_wild_lockheed',
    '0013_clean_jubilee',
  ])
    await pg.exec(readFileSync(`drizzle/${file}.sql`, 'utf8'))
  const db = drizzle(pg, { schema }) as unknown as Database
  for (const id of ['owner', 'employee', 'outsider', 'manager'])
    await db
      .insert(schema.user)
      .values({ id, name: id, email: `${id}@example.test`, emailVerified: true })
  const workspaceId = crypto.randomUUID()
  await db.insert(schema.workspace).values({
    id: workspaceId,
    slug: workspaceId,
    name: 'AI test',
    createdBy: 'owner',
    country: 'Indonesia',
    industry: 'Technology',
    timeZone: 'Asia/Jakarta',
    managersEnabled: true,
  })
  await db.insert(schema.workspaceMember).values([
    {
      id: crypto.randomUUID(),
      workspaceId,
      userId: 'owner',
      role: 'admin',
      firstName: 'Alex',
      lastName: 'Carter',
    },
    {
      id: crypto.randomUUID(),
      workspaceId,
      userId: 'employee',
      role: 'employee',
      firstName: 'Emily',
      lastName: 'Lee',
    },
    { id: crypto.randomUUID(), workspaceId, userId: 'manager', role: 'manager' },
  ])
  const settings = {
    workspaceId,
    enabled: true,
    allowWrites: true,
    allowedRoles: ['admin', 'employee', 'manager'],
    version: 0,
    monthlyTokens: 100000,
    dailyRequests: 30,
    apiKey: key,
  }
  await saveSettings(db, 'owner', settings, secret, async () => {})
  const ask = (p: AiPlan, actor = 'owner', id = crypto.randomUUID(), run?: Interpret) =>
    message(
      db,
      actor,
      { workspaceId, requestId: id, message: JSON.stringify(p) },
      secret,
      run || (async () => ({ plan: p, tokens: 120 })),
    )
  return { pg, db, workspaceId, settings, ask }
}

test('AI key encryption is bound to its workspace, never returned, and admin-only', async () => {
  const f = await fixture()
  try {
    const [saved] = await f.db.select().from(schema.aiSettings)
    expect(saved.encryptedKey).not.toContain(key)
    expect(await cryptKey(secret, f.workspaceId, saved.encryptedKey!, true)).toBe(key)
    await expect(cryptKey(secret, 'another-workspace', saved.encryptedKey!, true)).rejects.toThrow()
    expect(JSON.stringify(await settingsView(f.db, 'owner', f.workspaceId))).not.toContain(key)
    expect(await settingsView(f.db, 'employee', f.workspaceId)).not.toHaveProperty('encryptedKey')
    await expect(
      saveSettings(f.db, 'employee', { ...f.settings, version: 1 }, secret, async () => {}),
    ).rejects.toMatchObject({ status: 403 })
    await expect(history(f.db, 'outsider', f.workspaceId)).rejects.toMatchObject({ status: 403 })
    await disconnect(f.db, 'owner', { workspaceId: f.workspaceId })
    await expect(f.ask(plan('count'))).rejects.toMatchObject({ status: 403 })
  } finally {
    await f.pg.close()
  }
})

test('AI create requires review, validates missing fields and confirms exactly once', async () => {
  const f = await fixture()
  try {
    const t = await f.ask(plan('create', [{ field: 'fullName', value: 'Taylor Lee' }]))
    expect(t.status).toBe('draft')
    expect(await f.db.select().from(schema.employeeRecord)).toHaveLength(0)
    const command = { workspaceId: f.workspaceId, id: t.id, version: t.version, action: 'confirm' }
    await expect(action(f.db, 'owner', command)).rejects.toThrow()
    await expect(action(f.db, 'employee', command)).rejects.toMatchObject({ status: 404 })
    const changed = await action(f.db, 'owner', {
      ...command,
      action: 'revise',
      changes: [
        { field: 'fullName', value: 'Taylor Lee' },
        { field: 'email', value: 'taylor@example.test' },
        { field: 'employeeNumber', value: 'EMP1001' },
        { field: 'startDate', value: '2026-09-27' },
        { field: 'jobTitle', value: 'Designer' },
      ],
    })
    await expect(action(f.db, 'owner', command)).rejects.toMatchObject({ status: 409 })
    await expect(
      action(f.db, 'owner', {
        ...command,
        version: changed.version,
        changes: [{ field: 'jobTitle', value: 'CEO' }],
      }),
    ).rejects.toMatchObject({ status: 400 })
    const results = await Promise.all([
      action(f.db, 'owner', { ...command, version: changed.version }),
      action(f.db, 'owner', { ...command, version: changed.version }),
    ])
    expect(results[0].status).toBe('confirmed')
    expect(results[1]).toEqual(results[0])
    expect(await f.db.select().from(schema.employeeRecord)).toHaveLength(1)
    expect((await f.db.select().from(schema.employeeRecord))[0].fields).toMatchObject({
      jobTitle: 'Designer',
      role: 'employee',
    })
    expect(await f.db.select().from(schema.invitation)).toHaveLength(0)
    const read = await f.ask(plan('search', [], 'Taylor'))
    expect(read.result?.people?.[0].name).toBe('Taylor Lee')
    expect(JSON.stringify(read)).not.toMatch(/nationalId|personalEmail|encryptedKey/)
    const employeeRead = await f.ask(plan('search', [], 'Taylor'), 'employee')
    expect(employeeRead.result?.people).toEqual([])
    const employeeWrite = await f.ask(plan('create'), 'employee')
    expect(employeeWrite.status).toBe('failed')
  } finally {
    await f.pg.close()
  }
})

test('AI edits recheck permission, allowed fields, settings and current employee version', async () => {
  const f = await fixture()
  try {
    const create = await f.ask(
      plan('create', [
        { field: 'fullName', value: 'Taylor Lee' },
        { field: 'email', value: 'taylor@example.test' },
        { field: 'employeeNumber', value: 'EMP1001' },
        { field: 'startDate', value: '2026-09-27' },
      ]),
    )
    await action(f.db, 'owner', {
      workspaceId: f.workspaceId,
      id: create.id,
      version: 0,
      action: 'confirm',
    })
    const update = await f.ask(
      plan('update', [{ field: 'jobTitle', value: 'Designer' }], 'Taylor Lee'),
    )
    expect(update.status).toBe('draft')
    const cmd = { workspaceId: f.workspaceId, id: update.id, version: 0, action: 'confirm' }
    await expect(
      action(f.db, 'owner', {
        ...cmd,
        action: 'revise',
        changes: [{ field: 'email', value: 'changed@example.test' }],
      }),
    ).rejects.toMatchObject({ status: 400 })
    const saved = await action(f.db, 'owner', cmd)
    expect(saved.status).toBe('confirmed')
    expect((await f.db.select().from(schema.employeeRecord))[0].fields.jobTitle).toBe('Designer')
    const stale = await f.ask(
      plan('update', [{ field: 'department', value: 'Design' }], 'Taylor Lee'),
    )
    await f.db.update(schema.employeeRecord).set({ version: 99 })
    await expect(action(f.db, 'owner', { ...cmd, id: stale.id })).rejects.toMatchObject({
      status: 409,
    })
    const fresh = await f.ask(
      plan('update', [{ field: 'department', value: 'Design' }], 'Taylor Lee'),
    )
    await f.db
      .update(schema.workspaceMember)
      .set({ role: 'employee' })
      .where(eq(schema.workspaceMember.userId, 'owner'))
    await expect(action(f.db, 'owner', { ...cmd, id: fresh.id })).rejects.toMatchObject({
      status: 403,
    })
    expect(
      (await history(f.db, 'owner', f.workspaceId)).find((t) => t.id === fresh.id)?.result?.draft,
    ).toBeUndefined()
  } finally {
    await f.pg.close()
  }
})

test('AI reserves budgets before inference, rejects forged plans and preserves cancellation', async () => {
  const f = await fixture()
  try {
    await f.db.update(schema.aiSettings).set({ monthlyTokens: 16384 })
    let finish!: (value: { plan: AiPlan; tokens: number }) => void
    let entered!: () => void
    const started = new Promise<void>((r) => {
      entered = r
    })
    const id = crypto.randomUUID()
    const run: Interpret = async () => {
      entered()
      return new Promise((r) => {
        finish = r
      })
    }
    const pending = f.ask(plan('count'), 'owner', id, run)
    await started
    await expect(f.ask(plan('count'), 'employee')).rejects.toMatchObject({ status: 429 })
    await expect(f.ask(plan('count'), 'outsider')).rejects.toMatchObject({ status: 403 })
    expect((await f.ask(plan('count'), 'owner', id)).status).toBe('pending')
    await action(f.db, 'owner', { workspaceId: f.workspaceId, id, version: 0, action: 'cancel' })
    finish({ plan: plan('create'), tokens: 50 })
    expect((await pending).status).toBe('cancelled')
    expect(await f.db.select().from(schema.employeeRecord)).toHaveLength(0)
    await f.db.update(schema.aiSettings).set({ monthlyTokens: 100000 })
    const bad = await f.ask(plan('search'), 'employee', crypto.randomUUID(), async () => ({
      plan: { ...plan('update'), sql: 'select * from auth_user' } as AiPlan,
      tokens: 10,
    }))
    expect(bad.status).toBe('failed')
    expect(JSON.stringify(bad)).not.toContain('auth_user')
    expect((await settingsView(f.db, 'owner', f.workspaceId)).usedTokens).toBe(32768)
  } finally {
    await f.pg.close()
  }
})

test('provider uses a fixed endpoint and bounded structured output, never forwards history or tool data', async () => {
  const original = globalThis.fetch
  let sent: Record<string, unknown> = {}
  try {
    globalThis.fetch = async (url, init) => {
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
      expect(init?.redirect).toBe('error')
      sent = JSON.parse(String(init?.body))
      return Response.json({
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(plan('count')) } }],
        usage: { total_tokens: 110 },
      })
    }
    expect((await interpret(key, 'How many employees?')).tokens).toBe(110)
    expect(sent.messages).toHaveLength(2)
    expect(JSON.stringify(sent)).not.toContain(key)
    expect(sent.max_tokens).toBe(1000)
    globalThis.fetch = async () => new Response('secret upstream error', { status: 401 })
    await expect(interpret(key, 'hello')).rejects.toThrow('connection needs attention')
    globalThis.fetch = async () => new Response('x'.repeat(40000))
    await expect(interpret(key, 'hello')).rejects.toThrow('shorter question')
  } finally {
    globalThis.fetch = original
  }
})

test('private memory is isolated by both workspace and user, with bounded context and forget controls', async () => {
  const { readMemory, saveMemory, memoryContext, forgetMemory } =
    await import('../src/server/ai/memory')
  const f = await fixture()
  try {
    const workspaceB = crypto.randomUUID()
    await f.db.insert(schema.workspace).values({
      id: workspaceB,
      slug: workspaceB,
      name: 'Other company',
      createdBy: 'owner',
      country: 'Indonesia',
      industry: 'Technology',
      timeZone: 'Asia/Jakarta',
    })
    await f.db
      .insert(schema.workspaceMember)
      .values({ id: crypto.randomUUID(), workspaceId: workspaceB, userId: 'owner', role: 'admin' })
    await f.db
      .update(schema.workspaceMember)
      .set({ role: 'admin' })
      .where(eq(schema.workspaceMember.userId, 'employee'))
    const notes = 'Our Product Studio means the Design department.'
    await saveMemory(f.db, 'owner', {
      workspaceId: f.workspaceId,
      version: 0,
      notes,
      enabled: true,
    })
    expect((await readMemory(f.db, 'employee', f.workspaceId)).notes).toBe('')
    expect((await readMemory(f.db, 'owner', workspaceB)).notes).toBe('')
    await expect(readMemory(f.db, 'outsider', f.workspaceId)).rejects.toMatchObject({ status: 403 })
    await expect(
      saveMemory(f.db, 'employee', {
        workspaceId: f.workspaceId,
        version: 0,
        actorId: 'owner',
        notes: 'overwrite',
        enabled: true,
      }),
    ).rejects.toThrow()
    await expect(
      saveMemory(f.db, 'owner', {
        workspaceId: f.workspaceId,
        version: 0,
        notes: 'stale',
        enabled: true,
      }),
    ).rejects.toMatchObject({ status: 409 })
    await f.ask(plan('search', [], 'Emily'))
    const context = await memoryContext(f.db, 'owner', f.workspaceId, 'new-request')
    expect(context.context.notes).toBe(notes)
    expect(context.context.recentMessages).toHaveLength(1)
    expect(
      (await memoryContext(f.db, 'employee', f.workspaceId, 'other')).context.recentMessages,
    ).toEqual([])
    const draft = await f.ask(plan('create'))
    const before = (await settingsView(f.db, 'owner', f.workspaceId)).usedTokens
    await forgetMemory(f.db, 'owner', { workspaceId: f.workspaceId, version: 1, all: true })
    expect(await history(f.db, 'owner', f.workspaceId)).toEqual([])
    expect((await readMemory(f.db, 'owner', f.workspaceId)).notes).toBe('')
    expect((await settingsView(f.db, 'owner', f.workspaceId)).usedTokens).toBe(before)
    await expect(
      action(f.db, 'owner', {
        workspaceId: f.workspaceId,
        id: draft.id,
        version: 0,
        action: 'confirm',
      }),
    ).rejects.toMatchObject({ status: 409 })
    await saveMemory(f.db, 'owner', {
      workspaceId: f.workspaceId,
      version: 2,
      notes: 'Do not send me',
      enabled: false,
    })
    expect((await memoryContext(f.db, 'owner', f.workspaceId, 'new')).context).toEqual({
      notes: '',
      recentMessages: [],
    })
  } finally {
    await f.pg.close()
  }
})

test('forgetting memory during inference cannot restore a response or draft', async () => {
  const { forgetMemory } = await import('../src/server/ai/memory')
  const f = await fixture()
  try {
    let entered!: () => void
    let release!: () => void
    const started = new Promise<void>((r) => {
      entered = r
    })
    const wait = new Promise<void>((r) => {
      release = r
    })
    const pending = f.ask(plan('create'), 'owner', crypto.randomUUID(), async () => {
      entered()
      await wait
      return { plan: plan('create'), tokens: 100 }
    })
    await started
    await forgetMemory(f.db, 'owner', { workspaceId: f.workspaceId, version: 0, all: true })
    release()
    expect((await pending).status).toBe('forgotten')
    expect(await history(f.db, 'owner', f.workspaceId)).toEqual([])
    expect(await f.db.select().from(schema.employeeRecord)).toHaveLength(0)
  } finally {
    await f.pg.close()
  }
})

test('memory cleanup removes old text while preserving this month’s usage and other workspace data', async () => {
  const { compactMemory } = await import('../src/server/ai/memory')
  const f = await fixture()
  try {
    const base = {
      workspaceId: f.workspaceId,
      actorId: 'owner',
      prompt: 'Private conversation',
      status: 'done',
      result: { message: 'Historical response' },
      settingsVersion: 1,
      tokens: 150,
    }
    const recentId = crypto.randomUUID(),
      earlierId = crypto.randomUUID(),
      oldId = crypto.randomUUID()
    await f.db.insert(schema.aiTurn).values([
      { ...base, id: recentId, createdAt: new Date('2026-09-26') },
      { ...base, id: earlierId, createdAt: new Date('2026-09-10') },
      { ...base, id: oldId, createdAt: new Date('2026-08-01') },
      { ...base, id: crypto.randomUUID(), actorId: 'employee', createdAt: new Date('2026-08-01') },
    ])
    expect(await compactMemory(f.db, f.workspaceId, 'owner', new Date('2026-09-27'))).toEqual({
      removed: 1,
      compacted: 1,
    })
    const rows = await f.db.select().from(schema.aiTurn)
    expect(rows.find((t) => t.id === oldId)).toBeUndefined()
    expect(rows.find((t) => t.id === earlierId)).toMatchObject({
      prompt: '',
      result: null,
      tokens: 150,
    })
    expect(rows.find((t) => t.id === recentId)?.prompt).toBe(base.prompt)
    expect(rows.find((t) => t.actorId === 'employee')?.prompt).toBe(base.prompt)
  } finally {
    await f.pg.close()
  }
})

test('expired drafts and changed settings cannot be confirmed', async () => {
  const f = await fixture()
  try {
    const draft = await f.ask(plan('create'))
    const command = { workspaceId: f.workspaceId, id: draft.id, version: 0, action: 'confirm' }
    await f.db
      .update(schema.aiTurn)
      .set({ createdAt: new Date(Date.now() - 31 * 60000) })
      .where(eq(schema.aiTurn.id, draft.id))
    await expect(action(f.db, 'owner', command)).rejects.toThrow('expired')
    await f.db
      .update(schema.aiTurn)
      .set({ createdAt: new Date() })
      .where(eq(schema.aiTurn.id, draft.id))
    await f.db.update(schema.aiSettings).set({ version: 2 })
    await expect(action(f.db, 'owner', command)).rejects.toThrow('settings changed')
    expect(await f.db.select().from(schema.employeeRecord)).toHaveLength(0)
  } finally {
    await f.pg.close()
  }
})

const platform = {
  REKANN_AI_ENABLED: 'true' as const,
  AI: {
    run: async () => {
      throw Error('Use an explicit mock interpreter')
    },
  } as Pick<Ai, 'run'>,
}
async function fundedFixture() {
  const f = await fixture()
  await saveSettings(
    f.db,
    'owner',
    {
      ...f.settings,
      apiKey: undefined,
      funding: 'rekann',
      version: 1,
      monthlyTokens: 10000000,
      dailyRequests: 100,
    },
    secret,
    undefined,
    platform,
  )
  let calls = 0
  const askFunded = (
    p = plan('count'),
    actor = 'owner',
    id = crypto.randomUUID(),
    run?: Interpret,
  ) =>
    message(
      f.db,
      actor,
      { workspaceId: f.workspaceId, requestId: id, message: JSON.stringify(p) },
      secret,
      async (...args) => {
        calls++
        expect(args[0]).toBe('')
        return run ? run(...args) : { plan: p, tokens: 120 }
      },
      undefined,
      platform,
    )
  return { ...f, askFunded, calls: () => calls }
}

test('included AI limits cannot be raised by workspace admins; platform secrets and kill switch stay server-side', async () => {
  const f = await fundedFixture()
  try {
    const s = await settingsView(f.db, 'owner', f.workspaceId, platform)
    expect(s).toMatchObject({
      funding: 'rekann',
      connected: true,
      available: true,
      monthlyTokens: null,
      dailyRequests: null,
    })
    expect(s).not.toHaveProperty('AI')
    expect(JSON.stringify(s)).not.toContain(key)
    expect(s).not.toHaveProperty('encryptedKey')
    await expect(f.askFunded(plan('count'), 'outsider')).rejects.toMatchObject({ status: 403 })
    await expect(
      message(
        f.db,
        'owner',
        { workspaceId: f.workspaceId, requestId: crypto.randomUUID(), message: 'Hello' },
        secret,
        async () => {
          throw Error('must not call')
        },
      ),
    ).rejects.toMatchObject({ status: 403 })
    expect(f.calls()).toBe(0)
    await expect(
      saveSettings(
        f.db,
        'owner',
        { ...f.settings, version: 2, funding: 'rekann', apiKey: undefined },
        secret,
      ),
    ).resolves.toMatchObject({ enabled: true, available: false, unavailableReason: 'service' })
    expect(
      (
        await settingsView(f.db, 'owner', f.workspaceId, {
          ...platform,
          REKANN_AI_ENABLED: 'false',
        })
      ).available,
    ).toBe(false)
  } finally {
    await f.pg.close()
  }
})

test('funding switches, retries and forgetting cannot reset included usage; workspace keys never fall back', async () => {
  const f = await fundedFixture()
  try {
    const id = crypto.randomUUID()
    await f.askFunded(plan('count'), 'owner', id)
    await f.askFunded(plan('count'), 'owner', id)
    expect(f.calls()).toBe(1)
    expect(await settingsView(f.db, 'owner', f.workspaceId, platform)).toMatchObject({
      usedTokens: 120,
      usedToday: 1,
      workspaceUsedToday: 1,
    })
    const { forgetMemory } = await import('../src/server/ai/memory')
    await forgetMemory(f.db, 'owner', { workspaceId: f.workspaceId, version: 0, all: true })
    expect((await settingsView(f.db, 'owner', f.workspaceId, platform)).usedTokens).toBe(120)
    await f.db.delete(schema.rateLimit)
    await saveSettings(
      f.db,
      'owner',
      { ...f.settings, apiKey: undefined, version: 2, funding: 'workspace' },
      secret,
      undefined,
      platform,
    )
    expect((await settingsView(f.db, 'owner', f.workspaceId, platform)).usedTokens).toBe(0)
    let calls = 0
    const failed = await message(
      f.db,
      'owner',
      { workspaceId: f.workspaceId, requestId: crypto.randomUUID(), message: 'How many people?' },
      secret,
      async (k) => {
        calls++
        expect(k).toBe(key)
        throw Error('credit exhausted')
      },
      undefined,
      platform,
    )
    expect(failed.status).toBe('failed')
    expect(calls).toBe(1)
    await saveSettings(
      f.db,
      'owner',
      { ...f.settings, apiKey: undefined, version: 3, funding: 'rekann' },
      secret,
      undefined,
      platform,
    )
    expect(await settingsView(f.db, 'owner', f.workspaceId, platform)).toMatchObject({
      usedTokens: 120,
      usedToday: 1,
    })
    const day = new Date().toISOString().slice(0, 10)
    await f.db
      .update(schema.aiBudget)
      .set({ requests: 10 })
      .where(eq(schema.aiBudget.id, `person-day:owner:${day}`))
    await expect(f.askFunded()).rejects.toMatchObject({ status: 429 })
    expect(f.calls()).toBe(1)
  } finally {
    await f.pg.close()
  }
})

test('included AI reserves shared budget before calls and retains uncertain usage through deletion', async () => {
  const f = await fundedFixture()
  try {
    const month = new Date().toISOString().slice(0, 7) + '-01'
    await f.db
      .insert(schema.aiBudget)
      .values({ id: `platform:${month}`, period: month, tokens: 1000000 - 16384 })
    let finish!: (value: { plan: AiPlan; tokens: number }) => void
    let entered!: () => void
    const started = new Promise<void>((r) => {
      entered = r
    })
    const pending = f.askFunded(plan('count'), 'owner', crypto.randomUUID(), async () => {
      entered()
      return new Promise((r) => {
        finish = r
      })
    })
    await started
    await expect(f.askFunded(plan('count'), 'employee')).rejects.toMatchObject({ status: 429 })
    expect(f.calls()).toBe(1)
    const { forgetMemory } = await import('../src/server/ai/memory')
    await forgetMemory(f.db, 'owner', { workspaceId: f.workspaceId, version: 0, all: true })
    finish({ plan: plan('count'), tokens: 120 })
    expect((await pending).status).toBe('forgotten')
    expect((await settingsView(f.db, 'owner', f.workspaceId, platform)).usedTokens).toBe(16384)
    await f.db.delete(schema.workspace).where(eq(schema.workspace.id, f.workspaceId))
    expect(
      (
        await f.db
          .select()
          .from(schema.aiBudget)
          .where(eq(schema.aiBudget.id, `platform:${month}`))
      )[0].tokens,
    ).toBe(1000000)
  } finally {
    await f.pg.close()
  }
})

test('funded counters enforce cross-workspace person and shared workspace limits atomically', async () => {
  const f = await fixture()
  const { reserveFunded, settleFunded } = await import('../src/server/ai/budget')
  const now = new Date('2026-09-27T23:59:59Z')
  const reserve = (ws: string, actor: string) =>
    f.db.transaction(async (tx) => {
      await reserveFunded(tx, ws, actor, now)
      await settleFunded(tx, ws, actor, now, 100)
    })
  try {
    for (let i = 0; i < 5; i++) await reserve('workspace-' + i, 'same-person')
    await expect(reserve('one-more-workspace', 'same-person')).rejects.toMatchObject({
      status: 429,
    })
    expect(
      await f.db
        .select()
        .from(schema.aiBudget)
        .where(eq(schema.aiBudget.id, 'workspace:one-more-workspace:2026-09-01')),
    ).toHaveLength(0)
    for (let i = 0; i < 15; i++) await reserve('shared-workspace', 'person-' + i)
    await expect(reserve('shared-workspace', 'new-person')).rejects.toMatchObject({ status: 429 })
    expect(
      (
        await f.db
          .select()
          .from(schema.aiBudget)
          .where(eq(schema.aiBudget.id, 'platform:2026-09-01'))
      )[0],
    ).toMatchObject({ tokens: 2000, requests: 20 })
    // Reserve close to the monthly cap, then compete for the one remaining reservation.
    await f.db
      .update(schema.aiBudget)
      .set({ tokens: 1000000 - 16384 })
      .where(eq(schema.aiBudget.id, 'platform:2026-09-01'))
    const results = await Promise.allSettled(
      ['a', 'b'].map((ws) => f.db.transaction((tx) => reserveFunded(tx, ws, ws, now))),
    )
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
    expect(
      (
        await f.db
          .select()
          .from(schema.aiBudget)
          .where(eq(schema.aiBudget.id, 'platform:2026-09-01'))
      )[0].tokens,
    ).toBe(1000000)
  } finally {
    await f.pg.close()
  }
})

test('funded accounting uses reservation month across UTC rollover and bounded retention', async () => {
  const f = await fixture()
  const { reserveFunded, settleFunded, compactBudgets } = await import('../src/server/ai/budget')
  try {
    const before = new Date('2026-09-30T23:59:59Z')
    const after = new Date('2026-10-01T00:00:01Z')
    await f.db.transaction((tx) => reserveFunded(tx, 'ws', 'person', before))
    await f.db.transaction((tx) => reserveFunded(tx, 'ws', 'person', after))
    await f.db.transaction((tx) => settleFunded(tx, 'ws', 'person', before, 100))
    expect(
      (
        await f.db
          .select()
          .from(schema.aiBudget)
          .where(eq(schema.aiBudget.id, 'platform:2026-09-01'))
      )[0].tokens,
    ).toBe(100)
    expect(
      (
        await f.db
          .select()
          .from(schema.aiBudget)
          .where(eq(schema.aiBudget.id, 'platform:2026-10-01'))
      )[0].tokens,
    ).toBe(16384)
    await compactBudgets(f.db, new Date('2026-11-01T00:00:00Z'))
    expect(
      await f.db
        .select()
        .from(schema.aiBudget)
        .where(eq(schema.aiBudget.id, 'platform:2026-09-01')),
    ).toHaveLength(0)
    expect(
      await f.db
        .select()
        .from(schema.aiBudget)
        .where(eq(schema.aiBudget.id, 'platform:2026-10-01')),
    ).toHaveLength(1)
  } finally {
    await f.pg.close()
  }
})

test('included AI preserves explicit confirmation and blocks writes after changing connection', async () => {
  const f = await fundedFixture()
  try {
    const t = await f.askFunded(
      plan('create', [
        { field: 'fullName', value: 'Taylor Lee' },
        { field: 'email', value: 'taylor@example.test' },
        { field: 'employeeNumber', value: 'EMP1001' },
        { field: 'startDate', value: '2026-09-27' },
      ]),
    )
    expect(t.status).toBe('draft')
    expect(await f.db.select().from(schema.employeeRecord)).toHaveLength(0)
    const command = { workspaceId: f.workspaceId, id: t.id, version: t.version, action: 'confirm' }
    await expect(action(f.db, 'employee', command, platform)).rejects.toMatchObject({ status: 404 })
    expect((await action(f.db, 'owner', command, platform)).status).toBe('confirmed')
    expect((await action(f.db, 'owner', command, platform)).status).toBe('confirmed')
    expect(await f.db.select().from(schema.employeeRecord)).toHaveLength(1)
    const other = await f.askFunded(
      plan('update', [{ field: 'department', value: 'Design' }], 'Taylor Lee'),
    )
    await saveSettings(
      f.db,
      'owner',
      { ...f.settings, apiKey: undefined, version: 2, funding: 'workspace' },
      secret,
      undefined,
      platform,
    )
    await expect(
      action(f.db, 'owner', { ...command, id: other.id }, platform),
    ).rejects.toMatchObject({ status: 409 })
    expect(f.calls()).toBe(2)
  } finally {
    await f.pg.close()
  }
})

test('workspace included token cap rejects forged funding overrides before inference', async () => {
  const f = await fundedFixture()
  try {
    await f.askFunded()
    const month = new Date().toISOString().slice(0, 7) + '-01'
    await f.db
      .update(schema.aiBudget)
      .set({ tokens: 100000 - 16384 + 1 })
      .where(eq(schema.aiBudget.id, `workspace:${f.workspaceId}:${month}`))
    await expect(f.askFunded(plan('count'), 'employee')).rejects.toMatchObject({ status: 429 })
    expect(f.calls()).toBe(1)
    await expect(
      saveSettings(
        f.db,
        'owner',
        { ...f.settings, funding: 'rekann', version: 2, platformMonthlyTokens: 100000000 },
        secret,
        undefined,
        platform,
      ),
    ).rejects.toThrow()
    await expect(
      message(
        f.db,
        'owner',
        {
          workspaceId: f.workspaceId,
          requestId: crypto.randomUUID(),
          message: 'hello',
          funding: 'workspace',
        },
        secret,
        async () => {
          throw Error('must not call')
        },
        undefined,
        platform,
      ),
    ).rejects.toThrow()
    expect(
      (
        await f.db
          .select()
          .from(schema.aiBudget)
          .where(eq(schema.aiBudget.id, `platform:${month}`))
      )[0],
    ).toMatchObject({ tokens: 120, requests: 1 })
  } finally {
    await f.pg.close()
  }
})

test('included provider failures never ask a workspace admin to repair platform billing', async () => {
  const f = await fundedFixture()
  try {
    const { AppError } = await import('../src/server/workspaces')
    const t = await f.askFunded(plan('count'), 'owner', crypto.randomUUID(), async () => {
      throw new AppError(503, 'The AI provider balance is empty. Ask your admin to top it up.')
    })
    expect(t.status).toBe('failed')
    expect(t.result?.message).toBe('Rekann AI is unavailable right now. Please try again shortly.')
    expect(f.calls()).toBe(1)
    expect((await settingsView(f.db, 'owner', f.workspaceId, platform)).usedTokens).toBe(16384)
  } finally {
    await f.pg.close()
  }
})

test('Rekann AI is available by default without a settings row, with scoped read-only access', async () => {
  const f = await fixture()
  try {
    await f.db.delete(schema.aiSettings)
    for (const actor of ['owner', 'employee', 'manager'])
      expect(await settingsView(f.db, actor, f.workspaceId, platform)).toMatchObject({
        funding: 'rekann',
        enabled: true,
        available: true,
        version: 0,
        allowWrites: false,
        requestAllowance: { limit: 5, remaining: 5 },
      })
    expect(await settingsView(f.db, 'employee', f.workspaceId, platform)).not.toHaveProperty(
      'included',
    )
    const t = await message(
      f.db,
      'employee',
      { workspaceId: f.workspaceId, requestId: crypto.randomUUID(), message: 'Count the team' },
      undefined,
      async () => ({ plan: plan('count'), tokens: 120 }),
      undefined,
      platform,
    )
    expect(t.status).toBe('done')
    const allowance = (await settingsView(f.db, 'employee', f.workspaceId, platform))
      .requestAllowance
    expect(allowance).toMatchObject({ limit: 5, remaining: 4 })
    expect(new Date(allowance.resetsAt).toISOString()).toContain('T00:00:00.000Z')
    expect(
      (await settingsView(f.db, 'owner', f.workspaceId, platform)).requestAllowance.remaining,
    ).toBe(5)
    expect(await f.db.select().from(schema.aiSettings)).toHaveLength(0)
    await expect(history(f.db, 'outsider', f.workspaceId, platform)).rejects.toMatchObject({
      status: 403,
    })
    await saveSettings(
      f.db,
      'owner',
      { ...f.settings, apiKey: undefined, funding: 'rekann', enabled: false },
      undefined,
      undefined,
      platform,
    )
    expect(await settingsView(f.db, 'owner', f.workspaceId, platform)).toMatchObject({
      available: false,
      unavailableReason: 'paused',
    })
    await expect(
      message(
        f.db,
        'owner',
        { workspaceId: f.workspaceId, requestId: crypto.randomUUID(), message: 'hi' },
        undefined,
        async () => {
          throw Error('must not call')
        },
        undefined,
        platform,
      ),
    ).rejects.toMatchObject({ status: 403 })
  } finally {
    await f.pg.close()
  }
})

test('adaptive included quotas shrink at population thresholds and never fall below a reservation', async () => {
  const { includedPolicy, reserveFunded, settleFunded } = await import('../src/server/ai/budget')
  expect(includedPolicy(100)).toEqual({
    monthlyTokens: 65536,
    dailyRequests: 5,
    workspaceDailyRequests: 15,
  })
  expect(includedPolicy(101)).toEqual({
    monthlyTokens: 49152,
    dailyRequests: 3,
    workspaceDailyRequests: 10,
  })
  expect(includedPolicy(201)).toEqual({
    monthlyTokens: 32768,
    dailyRequests: 2,
    workspaceDailyRequests: 5,
  })
  expect(includedPolicy(1000).dailyRequests).toBe(2)
  expect(includedPolicy(1001)).toEqual({
    monthlyTokens: 32768,
    dailyRequests: 1,
    workspaceDailyRequests: 3,
  })
  const f = await fixture()
  try {
    // Exactly 101 verified active members crosses the first threshold.
    const people = Array.from({ length: 98 }, (_, i) => ({
      id: 'growth-' + i,
      name: 'Member',
      email: `growth-${i}@example.test`,
      emailVerified: true,
    }))
    await f.db.insert(schema.user).values(people)
    await f.db
      .insert(schema.workspaceMember)
      .values(
        people.map((p) => ({ id: crypto.randomUUID(), userId: p.id, workspaceId: f.workspaceId })),
      )
    const now = new Date()
    for (let i = 0; i < 3; i++)
      await f.db.transaction(async (tx) => {
        await reserveFunded(tx, f.workspaceId, 'owner', now)
        await settleFunded(tx, f.workspaceId, 'owner', now, 120)
      })
    await expect(
      f.db.transaction((tx) => reserveFunded(tx, f.workspaceId, 'owner', now)),
    ).rejects.toMatchObject({ status: 429 })
    // A duplicate membership must not count the same person twice; removed members do not count.
    await f.db
      .update(schema.workspaceMember)
      .set({ status: 'removed' })
      .where(eq(schema.workspaceMember.userId, 'growth-0'))
    await f.db.transaction(async (tx) => {
      await reserveFunded(tx, f.workspaceId, 'owner', now)
      await settleFunded(tx, f.workspaceId, 'owner', now, 120)
    })
  } finally {
    await f.pg.close()
  }
})

test('included Cloudflare adapter validates JSON, limits output, and does not call OpenRouter', async () => {
  const original = globalThis.fetch
  let calls = 0
  let result: unknown = { response: plan('count'), usage: { total_tokens: 210 } }
  const binding = {
    run: async (
      model: string,
      input: Record<string, unknown>,
      options: { signal: AbortSignal },
    ) => {
      calls++
      expect(model).toBe('@cf/meta/llama-3.1-8b-instruct-fp8-fast')
      expect(input.max_tokens).toBe(1000)
      expect(input.response_format).toMatchObject({ type: 'json_schema' })
      expect(options.signal).toBeInstanceOf(AbortSignal)
      return result
    },
  } as Pick<Ai, 'run'>
  try {
    globalThis.fetch = async () => {
      throw Error('No external HTTP provider allowed')
    }
    expect(await interpretBuiltin(binding, 'How many teammates?')).toEqual({
      plan: plan('count'),
      tokens: 210,
    })
    result = { response: JSON.stringify(plan('count')) }
    expect((await interpretBuiltin(binding, 'Count my team')).tokens).toBe(16384)
    result = { response: { ...plan('count'), action: 'execute_sql' } }
    await expect(interpretBuiltin(binding, 'Count my team')).rejects.toThrow()
    expect(calls).toBe(3)
    await expect(interpretBuiltin(binding, 'x'.repeat(14001))).rejects.toThrow('shorten')
    expect(calls).toBe(3)
  } finally {
    globalThis.fetch = original
  }
})

test('included daily pool blocks all workspaces before inference and resets by UTC day', async () => {
  const f = await fixture()
  const { reserveFunded, platformDailyTokens } = await import('../src/server/ai/budget')
  const now = new Date('2026-09-27T12:00:00Z')
  try {
    await f.db.insert(schema.aiBudget).values({
      id: 'platform-day:2026-09-27',
      period: '2026-09-27',
      tokens: platformDailyTokens - 16384,
    })
    const results = await Promise.allSettled(
      ['first', 'second'].map((id) => f.db.transaction((tx) => reserveFunded(tx, id, id, now))),
    )
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
    await expect(
      f.db.transaction((tx) => reserveFunded(tx, 'third', 'third', now)),
    ).rejects.toThrow('today')
    await expect(
      f.db.transaction((tx) =>
        reserveFunded(tx, 'third', 'third', new Date('2026-09-28T00:00:00Z')),
      ),
    ).resolves.toBeUndefined()
  } finally {
    await f.pg.close()
  }
})
