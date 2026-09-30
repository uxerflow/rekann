import { test, expect } from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import * as schema from '../src/server/schema'
import type { Database } from '../src/server/db'
import {
  adminLeaves,
  employeeLeaveOptions,
  saveLeavePolicy,
  leaveState,
  balanceFor,
} from '../src/server/leaves'
import { recordEmployeeLeave, reviewEmployeeLeave } from '../src/server/employee-time'
import {
  defaultPolicy,
  dateDays,
  periodBounds,
  eligible,
  type PolicyDraft,
} from '../src/shared/leaves'
async function setup() {
  const pg = new PGlite()
  for (const file of [
    '0000_thankful_groot',
    '0001_workspace_slug',
    '0003_require_workspace_slug',
    '0006_cuddly_stature',
    '0007_red_ser_duncan',
    '0009_open_junta',
    '0014_curved_zodiak',
  ])
    await pg.exec(readFileSync(`drizzle/${file}.sql`, 'utf8'))
  const db = drizzle(pg, { schema }) as unknown as Database
  await db.insert(schema.user).values(
    ['admin', 'employee', 'peer', 'outsider'].map((id) => ({
      id,
      name: id,
      email: `${id}@example.test`,
    })),
  )
  await db.insert(schema.workspace).values(
    ['one', 'two'].map((id) => ({
      id,
      slug: id,
      name: id,
      createdBy: 'admin',
      country: 'Indonesia',
      industry: 'Technology',
      timeZone: 'Asia/Jakarta',
    })),
  )
  await db.insert(schema.workspaceMember).values(
    ['admin', 'employee', 'peer', 'outsider'].map((id) => ({
      id: `m-${id}`,
      userId: id,
      workspaceId: id === 'outsider' ? 'two' : 'one',
      role: id === 'admin' || id === 'outsider' ? ('admin' as const) : ('employee' as const),
      firstName: id,
      profileCompleted: true,
      employmentType: 'Full-time',
      department: 'Design',
      startDate: '2020-01-01',
    })),
  )
  return { db, pg }
}
function policy(
  kind: PolicyDraft['kind'] = 'annual',
  rules: Partial<PolicyDraft['rules']> = {},
): PolicyDraft {
  return {
    id: crypto.randomUUID(),
    workspaceId: 'one',
    version: 0,
    kind,
    name: kind === 'annual' ? 'Annual leave' : kind === 'closure' ? 'Company break' : 'Study leave',
    category: kind === 'closure' ? 'Company closure' : kind === 'custom' ? 'Study leave' : '',
    description: '',
    active: true,
    rules: {
      ...defaultPolicy(kind),
      eligibleMonths: 0,
      notice: 0,
      maxRequests: 0,
      maxDuration: 0,
      maxOff: 0,
      ...rules,
    },
  }
}
function request(member = 'employee', date = '2027-02-01', extra = {}) {
  return {
    workspaceId: 'one',
    id: `m-${member}`,
    requestId: crypto.randomUUID(),
    type: 'Annual leave',
    startDate: date,
    endDate: date,
    duration: 'Full day',
    reason: 'Personal time',
    ...extra,
  }
}

test('admin leaves deny employees, outsiders, removed memberships and forged policy identities', async () => {
  const { db, pg } = await setup()
  try {
    for (const actor of ['employee', 'outsider']) {
      await expect(adminLeaves(db, actor, 'one')).rejects.toMatchObject({ status: 403 })
      await expect(saveLeavePolicy(db, actor, policy())).rejects.toMatchObject({ status: 403 })
    }
    await expect(
      saveLeavePolicy(db, 'admin', { ...policy('custom'), name: 'Annual leave' }),
    ).rejects.toThrow('reserved for the annual policy')
    const p = policy()
    await saveLeavePolicy(db, 'admin', p)
    await expect(
      saveLeavePolicy(db, 'admin', {
        ...policy('closure', { startDate: '2027-02-01', endDate: '2027-02-02' }),
        id: p.id,
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 400 })
    await db
      .update(schema.workspaceMember)
      .set({ status: 'removed' })
      .where(eq(schema.workspaceMember.id, 'm-admin'))
    await expect(adminLeaves(db, 'admin', 'one')).rejects.toMatchObject({ status: 403 })
  } finally {
    await pg.close()
  }
})
test('policy revisions preserve the current entitlement and prevent stale updates', async () => {
  const { db, pg } = await setup()
  try {
    const year = new Date().getUTCFullYear()
    const p = policy()
    await saveLeavePolicy(db, 'admin', p)
    await saveLeavePolicy(db, 'admin', { ...p, version: 1, rules: { ...p.rules, days: 18 } })
    await expect(
      saveLeavePolicy(db, 'admin', { ...p, version: 1, rules: { ...p.rules, days: 20 } }),
    ).rejects.toMatchObject({ status: 409 })
    const state = await leaveState(db, 'one'),
      person = state.people.find((p) => p.id === 'm-employee')!
    expect(balanceFor(state, person, 'Annual leave', `${year}-10-01`).allowance).toBe(12)
    expect(balanceFor(state, person, 'Annual leave', `${year + 1}-02-01`).allowance).toBe(18)
    await saveLeavePolicy(db, 'admin', { ...p, version: 2, active: false })
    expect(
      (await employeeLeaveOptions(db, 'admin', 'one', person.id, `${year + 1}-02-01`)).some(
        (x) => x.name === 'Annual leave',
      ),
    ).toBe(false)
  } finally {
    await pg.close()
  }
})
test('requests enforce policy eligibility, document, notice, unit and period boundaries', async () => {
  const { db, pg } = await setup()
  try {
    await saveLeavePolicy(
      db,
      'admin',
      policy('custom', { days: 10, halfDay: false, document: 'Required', period: 'Per month' }),
    )
    await expect(
      recordEmployeeLeave(db, 'admin', request('employee', '2027-02-01', { type: 'Study leave' })),
    ).rejects.toThrow('Attach a supporting document')
    await expect(
      recordEmployeeLeave(
        db,
        'admin',
        request('employee', '2027-02-01', { type: 'Study leave', duration: 'Half day' }),
      ),
    ).rejects.toThrow('full days only')
    await saveLeavePolicy(db, 'admin', policy('annual', { notice: 14 }))
    await expect(
      recordEmployeeLeave(db, 'admin', request('employee', new Date().toISOString().slice(0, 10))),
    ).rejects.toThrow('14 days of notice')
    await db
      .update(schema.workspaceMember)
      .set({ employmentType: 'Internship' })
      .where(eq(schema.workspaceMember.id, 'm-employee'))
    await expect(recordEmployeeLeave(db, 'admin', request())).rejects.toThrow('eligibility')
  } finally {
    await pg.close()
  }
})
test('approval is atomic, retry-safe, prevents self-review and enforces simultaneous team limits', async () => {
  const { db, pg } = await setup()
  try {
    await saveLeavePolicy(db, 'admin', policy('annual', { maxOff: 1, days: 2 }))
    const a = request(),
      b = request('peer')
    await recordEmployeeLeave(db, 'employee', a)
    await recordEmployeeLeave(db, 'peer', b)
    await expect(
      reviewEmployeeLeave(db, 'employee', { ...a, action: 'approve' }),
    ).rejects.toMatchObject({ status: 403 })
    await reviewEmployeeLeave(db, 'admin', { ...a, action: 'approve' })
    await reviewEmployeeLeave(db, 'admin', { ...a, action: 'approve' })
    await expect(reviewEmployeeLeave(db, 'admin', { ...b, action: 'approve' })).rejects.toThrow(
      'availability limit',
    )
    const state = await leaveState(db, 'one')
    expect(state.requests.find((x) => x.id === b.requestId)?.status).toBe('pending')
    expect(
      balanceFor(
        state,
        state.people.find((x) => x.id === 'm-employee')!,
        'Annual leave',
        a.startDate,
      ).remaining,
    ).toBe(1)
    await reviewEmployeeLeave(db, 'admin', { ...a, action: 'cancel' })
    await reviewEmployeeLeave(db, 'admin', { ...b, action: 'approve' })
  } finally {
    await pg.close()
  }
})
test('closures refund only overlapping days, cancel pending requests and block new bookings', async () => {
  const { db, pg } = await setup()
  try {
    await saveLeavePolicy(db, 'admin', policy())
    const approved = request('employee', '2027-02-01', { endDate: '2027-02-03' }),
      pending = request('peer', '2027-02-02')
    await recordEmployeeLeave(db, 'admin', approved)
    await recordEmployeeLeave(db, 'peer', pending)
    const c = policy('closure', { startDate: '2027-02-02', endDate: '2027-02-02' })
    await saveLeavePolicy(db, 'admin', c)
    const state = await leaveState(db, 'one')
    expect(state.requests.find((r) => r.id === pending.requestId)?.status).toBe('cancelled')
    expect(
      balanceFor(
        state,
        state.people.find((p) => p.id === 'm-employee')!,
        'Annual leave',
        '2027-02-01',
      ).remaining,
    ).toBe(10)
    await expect(recordEmployeeLeave(db, 'admin', request('peer', '2027-02-02'))).rejects.toThrow(
      'company closure',
    )
    await expect(
      saveLeavePolicy(
        db,
        'admin',
        policy('closure', { startDate: '2027-02-02', endDate: '2027-02-03' }),
      ),
    ).rejects.toMatchObject({ status: 409 })
  } finally {
    await pg.close()
  }
})
test('deducting closures do not double-charge retained bookings and insufficient balance rolls back', async () => {
  const { db, pg } = await setup()
  try {
    await saveLeavePolicy(db, 'admin', policy('annual', { days: 2 }))
    await recordEmployeeLeave(db, 'admin', request('employee', '2027-02-01'))
    const c = policy('closure', {
      startDate: '2027-02-01',
      endDate: '2027-02-02',
      deductAnnual: true,
      approvedRequests: 'Keep existing requests',
    })
    await saveLeavePolicy(db, 'admin', c)
    const state = await leaveState(db, 'one')
    expect(
      balanceFor(
        state,
        state.people.find((p) => p.id === 'm-employee')!,
        'Annual leave',
        '2027-02-01',
      ).remaining,
    ).toBe(0)
    await expect(
      saveLeavePolicy(db, 'admin', {
        ...c,
        version: 1,
        rules: { ...c.rules, endDate: '2027-02-03' },
      }),
    ).rejects.toThrow('enough annual leave')
    expect((await leaveState(db, 'one')).policies.find((p) => p.id === c.id)?.rules.endDate).toBe(
      '2027-02-02',
    )
  } finally {
    await pg.close()
  }
})
test('calendar date calculations handle leap years, weekends and anniversary boundaries', () => {
  expect(
    eligible(
      {
        id: 'member',
        userId: 'user',
        name: 'Future joiner',
        jobTitle: 'Designer',
        department: 'Design',
        employmentType: 'Full-time',
        startDate: '2027-01-01',
        gender: '',
        avatarKey: null,
        active: true,
      },
      defaultPolicy('custom'),
      '2026-12-31',
    ),
  ).toBe(false)
  expect(dateDays('2028-02-28', '2028-03-01')).toHaveLength(3)
  expect(dateDays('2027-02-06', '2027-02-07')).toHaveLength(0)
  expect(dateDays('2027-02-06', '2027-02-07', 'Calendar days')).toHaveLength(2)
  expect(
    periodBounds('2027-02-27', { period: 'Per year', reset: 'Employee join date' }, '2024-02-29'),
  ).toEqual({ start: '2026-02-28', end: '2027-02-27' })
  expect(
    periodBounds('2028-02-29', { period: 'Per year', reset: 'Employee join date' }, '2024-02-29'),
  ).toEqual({ start: '2028-02-29', end: '2029-02-27' })
})

test('carry forward includes closure deductions and uses anniversary revisions at the cycle start', async () => {
  const { db, pg } = await setup()
  try {
    const p = policy('annual', { days: 5, unused: 'Carry forward' })
    await saveLeavePolicy(db, 'admin', p)
    await saveLeavePolicy(
      db,
      'admin',
      policy('closure', { startDate: '2027-02-01', endDate: '2027-02-01', deductAnnual: true }),
    )
    let state = await leaveState(db, 'one')
    const person = state.people.find((p) => p.id === 'm-employee')!
    const currentYear = new Date().getUTCFullYear()
    const expected = (2028 - currentYear + 1) * 5 - 1
    expect(balanceFor(state, person, 'Annual leave', '2028-02-01').remaining).toBe(expected)
    expect(
      balanceFor(state, { ...person, startDate: '2028-01-01' }, 'Annual leave', '2028-02-01')
        .remaining,
    ).toBe(5)
    const anniversary = {
      ...p.rules,
      unused: 'Expire unused days' as const,
      reset: 'Employee join date' as const,
    }
    state = {
      ...state,
      policies: state.policies
        .filter((x) => x.kind !== 'closure')
        .map((x) => ({
          ...x,
          rules: anniversary,
          revisions: [
            { effectiveFrom: '2026-01-01', rules: anniversary },
            { effectiveFrom: '2027-01-01', rules: { ...anniversary, days: 10 } },
          ],
        })),
    }
    const joined = { ...person, startDate: '2020-07-01' }
    expect(balanceFor(state, joined, 'Annual leave', '2027-02-01').allowance).toBe(5)
    expect(balanceFor(state, joined, 'Annual leave', '2027-07-01').allowance).toBe(10)
  } finally {
    await pg.close()
  }
})

test('kept pending requests can be approved during a closure and allowed bookings are not double charged', async () => {
  const { db, pg } = await setup()
  try {
    await saveLeavePolicy(db, 'admin', policy('annual', { days: 1 }))
    const pending = request()
    await recordEmployeeLeave(db, 'employee', pending)
    const c = policy('closure', {
      startDate: '2027-02-01',
      endDate: '2027-02-01',
      deductAnnual: true,
      approvedRequests: 'Keep existing requests',
      pendingRequests: 'Keep pending requests',
    })
    await saveLeavePolicy(db, 'admin', c)
    await reviewEmployeeLeave(db, 'admin', { ...pending, action: 'approve' })
    await saveLeavePolicy(db, 'admin', {
      ...c,
      version: 1,
      rules: { ...c.rules, blockRequests: false },
    })
    await recordEmployeeLeave(db, 'admin', request('peer'))
    const state = await leaveState(db, 'one')
    for (const id of ['m-employee', 'm-peer'])
      expect(
        balanceFor(state, state.people.find((p) => p.id === id)!, 'Annual leave', '2027-02-01')
          .remaining,
      ).toBe(0)
  } finally {
    await pg.close()
  }
})

test('monthly boundaries, owner approval and reductions below approved usage are enforced', async () => {
  const { db, pg } = await setup()
  try {
    const p = policy('custom', { days: 3, period: 'Per month', approver: 'Owner' })
    await saveLeavePolicy(db, 'admin', p)
    await expect(
      recordEmployeeLeave(
        db,
        'employee',
        request('employee', '2027-02-26', { type: p.name, endDate: '2027-03-01' }),
      ),
    ).rejects.toThrow('period boundary')
    const r = request('employee', '2027-02-01', { type: p.name, endDate: '2027-02-02' })
    await recordEmployeeLeave(db, 'employee', r)
    await db
      .update(schema.workspaceMember)
      .set({ role: 'admin' })
      .where(eq(schema.workspaceMember.id, 'm-peer'))
    await expect(
      reviewEmployeeLeave(db, 'peer', { ...r, action: 'approve' }),
    ).rejects.toMatchObject({ status: 403 })
    await reviewEmployeeLeave(db, 'admin', { ...r, action: 'approve' })
    await expect(
      saveLeavePolicy(db, 'admin', { ...p, version: 1, rules: { ...p.rules, days: 1 } }),
    ).rejects.toThrow('lower than leave already approved')
  } finally {
    await pg.close()
  }
})

test('unlimited custom policies do not require a hidden numeric allowance', async () => {
  const { db, pg } = await setup()
  try {
    const p = policy('custom', { unlimited: true, days: 0 })
    await saveLeavePolicy(db, 'admin', p)
    const options = await employeeLeaveOptions(db, 'admin', 'one', 'm-employee', '2027-02-01')
    expect(options.find((x) => x.name === p.name)?.remaining).toBeNull()
    await recordEmployeeLeave(
      db,
      'admin',
      request('employee', '2027-02-01', { type: p.name, endDate: '2027-02-26' }),
    )
    await expect(
      saveLeavePolicy(db, 'admin', { ...p, version: 1, rules: { ...p.rules, unlimited: false } }),
    ).rejects.toThrow('half a day')
  } finally {
    await pg.close()
  }
})
