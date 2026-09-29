import { and, eq, desc } from 'drizzle-orm'
import { z } from 'zod'
import type { Database, Transaction } from './db'
import {
  employeeAllowance,
  employeeLeave,
  employeeRecord,
  leavePolicy,
  workspaceMember,
  user,
} from './schema'
import { AppError, authorize } from './workspaces'
import { detailAudit } from './employee-detail'
import { dayInZone } from '../shared/employee-detail'
import {
  addDays,
  dateDays,
  eligible,
  periodBounds,
  rulesOn,
  savePolicyInput,
  type LeavePerson,
  type PolicyRules,
} from '../shared/leaves'

type Db = Database | Transaction
export type LeavePolicy = typeof leavePolicy.$inferSelect
export type LeaveRequest = typeof employeeLeave.$inferSelect
export async function leaveState(db: Db, workspaceId: string) {
  const rows = await db
    .select({ member: workspaceMember, record: employeeRecord, userName: user.name })
    .from(workspaceMember)
    .innerJoin(user, eq(user.id, workspaceMember.userId))
    .leftJoin(
      employeeRecord,
      and(
        eq(employeeRecord.memberId, workspaceMember.id),
        eq(employeeRecord.workspaceId, workspaceId),
      ),
    )
    .where(eq(workspaceMember.workspaceId, workspaceId))
    .orderBy(workspaceMember.createdAt, workspaceMember.id)
  const people: LeavePerson[] = rows.map(({ member: m, record: r, userName }) => ({
    id: m.id,
    userId: m.userId,
    name: [m.firstName, m.lastName].filter(Boolean).join(' ') || userName,
    jobTitle: m.jobTitle,
    department: m.department || '',
    employmentType: m.employmentType || '',
    startDate: m.startDate || '',
    gender: r?.fields.gender || '',
    avatarKey: m.avatarKey,
    active: m.status === 'active' && !r?.inactiveAt,
  }))
  const policies = await db
    .select()
    .from(leavePolicy)
    .where(eq(leavePolicy.workspaceId, workspaceId))
    .orderBy(leavePolicy.createdAt)
  const requests = await db
    .select()
    .from(employeeLeave)
    .where(eq(employeeLeave.workspaceId, workspaceId))
    .orderBy(desc(employeeLeave.createdAt))
  const allowances = await db
    .select()
    .from(employeeAllowance)
    .where(eq(employeeAllowance.workspaceId, workspaceId))
  return { people, policies, requests, allowances }
}
export type LeaveState = Awaited<ReturnType<typeof leaveState>>
async function admin(db: Db, viewerId: string, workspaceId: string, lock = false) {
  const a = await authorize(db, viewerId, workspaceId, lock)
  if (a.employee.role !== 'admin')
    throw new AppError(403, 'Only an admin can manage workspace leaves.')
  return a
}
export async function adminLeaves(db: Database, viewerId: string, workspaceId: string) {
  const a = await admin(db, viewerId, workspaceId)
  return {
    ...(await leaveState(db, workspaceId)),
    today: dayInZone(new Date(), a.company.timeZone),
    viewerMemberId: a.employee.id,
    timeZone: a.company.timeZone,
  }
}
export type AdminLeaves = Awaited<ReturnType<typeof adminLeaves>>
const inRange = (d: string, start: string, end: string) => d >= start && d <= end
const covered = (p: LeavePolicy, memberId: string) =>
  p.active && p.kind === 'closure' && p.coveredMemberIds.includes(memberId)
export function chargedDays(
  request: LeaveRequest,
  policies: LeavePolicy[],
  start = request.startDate,
  end = request.endDate,
) {
  return (
    dateDays(request.startDate, request.endDate, request.policyRules?.countAs).filter(
      (day) =>
        inRange(day, start, end) &&
        !policies.some(
          (p) =>
            covered(p, request.memberId) &&
            p.rules.approvedRequests === 'Refund their balances' &&
            dateDays(p.rules.startDate, p.rules.endDate, p.rules.countAs).includes(day),
        ),
    ).length * (request.duration === 'Half day' ? 0.5 : 1)
  )
}
export type LeaveBalance = {
  allowance: number | null
  used: number
  carried: number
  remaining: number | null
  start: string
  end: string
  rules: PolicyRules | null
  policyId: string | null
}
export function balanceFor(
  state: LeaveState,
  person: LeavePerson,
  type: string,
  date: string,
  skipId?: string,
): LeaveBalance {
  const policy = state.policies.find((p) => p.kind !== 'closure' && p.name === type)
  let rules = policy ? rulesOn(policy.revisions, date) : null
  if (policy?.kind === 'annual' && rules?.reset === 'Employee join date') {
    const cycle = periodBounds(date, rules, person.startDate)
    rules = rulesOn(policy.revisions, cycle.start) ?? rules
  }
  const bounds = periodBounds(
    date,
    rules ?? { period: 'Per year', reset: 'January 1' },
    person.startDate,
  )
  const override = state.allowances.find(
    (a) =>
      a.memberId === person.id && a.type === type && a.year === Number(bounds.start.slice(0, 4)),
  )
  const allowance = override
    ? override.halfDays / 2
    : rules
      ? rules.unlimited
        ? null
        : rules.days
      : type === 'Unpaid leave'
        ? null
        : 0
  const approved = state.requests.filter(
    (r) =>
      r.id !== skipId && r.memberId === person.id && r.type === type && r.status === 'approved',
  )
  let used = approved.reduce(
    (s, r) => s + chargedDays(r, state.policies, bounds.start, bounds.end),
    0,
  )
  if (type === 'Annual leave') {
    const closureDates = new Set(
      state.policies
        .filter((p) => covered(p, person.id) && p.rules.deductAnnual)
        .flatMap((p) => dateDays(p.rules.startDate, p.rules.endDate, p.rules.countAs))
        .filter((d) => inRange(d, bounds.start, bounds.end)),
    )
    for (const d of closureDates) {
      // Existing retained bookings already account for this day (including half days).
      const charged = approved.reduce((sum, r) => sum + chargedDays(r, state.policies, d, d), 0)
      used += Math.max(0, 1 - charged)
    }
  }
  let carried = 0
  // Carry unused days from the previous cycle, including its already-carried days.
  if (rules?.unused === 'Carry forward' && allowance !== null) {
    const previousDate = addDays(bounds.start, -1)
    const previousRules = policy && rulesOn(policy.revisions, previousDate)
    if (previousRules?.unused === 'Carry forward') {
      const previous = balanceFor(state, person, type, previousDate, skipId)
      if (
        previous.rules &&
        eligible(person, previous.rules, previous.end) &&
        (!person.startDate || person.startDate <= previous.end)
      )
        carried = Math.max(0, previous.remaining ?? 0)
    }
  }
  return {
    allowance,
    used,
    carried,
    remaining: allowance === null ? null : allowance + carried - used,
    start: bounds.start,
    end: bounds.end,
    rules,
    policyId: policy?.id ?? null,
  }
}
export async function employeeLeaveOptions(
  db: Database,
  viewerId: string,
  workspaceId: string,
  memberId: string,
  date: string,
) {
  await admin(db, viewerId, workspaceId)
  z.iso.date().parse(date)
  const state = await leaveState(db, workspaceId)
  const person = state.people.find((p) => p.id === memberId && p.active)
  if (!person) throw new AppError(404, 'Employee not found.')
  const names = new Set([
    ...state.allowances.filter((a) => a.memberId === memberId).map((a) => a.type),
    'Unpaid leave',
    ...state.policies.filter((p) => p.kind !== 'closure').map((p) => p.name),
  ])
  return [...names].flatMap((name) => {
    const policy = state.policies.find((p) => p.kind !== 'closure' && p.name === name)
    const balance = balanceFor(state, person, name, date)
    if (policy && (!policy.active || !balance.rules || !eligible(person, balance.rules, date)))
      return []
    return [{ name, ...balance }]
  })
}
export type LeaveOption = Awaited<ReturnType<typeof employeeLeaveOptions>>[number]
export async function checkLeavePolicy(
  tx: Transaction,
  workspaceId: string,
  memberId: string,
  input: {
    type: string
    startDate: string
    endDate: string
    duration: string
    attachmentId?: string | null
  },
  today: string,
  skipId?: string,
  savedRules?: PolicyRules | null,
) {
  const state = await leaveState(tx, workspaceId)
  const person = state.people.find((p) => p.id === memberId)
  if (!person?.active)
    throw new AppError(409, 'Reactivate this employee before recording time off.')
  const policy = state.policies.find((p) => p.kind !== 'closure' && p.name === input.type)
  const balance = balanceFor(state, person, input.type, input.startDate, skipId)
  const rules = savedRules ?? balance.rules
  if (policy && !skipId && (!policy.active || !rules))
    throw new AppError(409, 'This leave policy is not active for these dates.')
  if (
    !policy &&
    !['Annual leave', 'Sick leave', 'Personal leave', 'Unpaid leave'].includes(input.type)
  )
    throw new AppError(400, 'Choose a valid leave type.')
  if (rules) {
    if (!eligible(person, rules, input.startDate))
      throw new AppError(409, 'This employee does not meet the leave eligibility requirements.')
    if (input.duration === 'Half day' && !rules.halfDay)
      throw new AppError(400, 'This policy allows full days only.')
    if (!skipId && input.startDate < addDays(today, rules.notice) && rules.notice)
      throw new AppError(400, `This policy requires ${rules.notice} days of notice.`)
    if (rules.document === 'Required' && !input.attachmentId)
      throw new AppError(400, 'Attach a supporting document for this leave.')
    if (input.endDate > balance.end)
      throw new AppError(400, 'Split this request at the allowance period boundary.')
  }
  const days = dateDays(input.startDate, input.endDate, rules?.countAs)
  const amount = days.length * (input.duration === 'Half day' ? 0.5 : 1)
  if (!amount) throw new AppError(400, 'Choose at least one leave day.')
  if (rules?.maxDuration && amount > rules.maxDuration)
    throw new AppError(400, `Choose at most ${rules.maxDuration} days for this request.`)
  if (
    !skipId &&
    state.policies.some(
      (p) =>
        covered(p, memberId) &&
        p.rules.blockRequests &&
        days.some((d) => dateDays(p.rules.startDate, p.rules.endDate, p.rules.countAs).includes(d)),
    )
  )
    throw new AppError(409, 'These dates include a company closure. Choose different dates.')
  if (rules?.maxRequests) {
    const period = periodBounds(input.startDate, {
      period: rules.requestPeriod,
      reset: 'January 1',
    })
    if (
      state.requests.filter(
        (r) =>
          r.id !== skipId &&
          r.memberId === memberId &&
          r.type === input.type &&
          ['pending', 'approved'].includes(r.status) &&
          inRange(r.startDate, period.start, period.end),
      ).length >= rules.maxRequests
    )
      throw new AppError(409, 'This employee has reached the request limit for this period.')
  }
  if (rules?.maxOff) {
    const members = new Set(
      state.people
        .filter((p) => rules.limitWithin === 'Company' || p.department === person.department)
        .map((p) => p.id),
    )
    if (
      days.some(
        (day) =>
          new Set(
            state.requests
              .filter(
                (r) =>
                  r.id !== skipId &&
                  members.has(r.memberId) &&
                  r.status === 'approved' &&
                  dateDays(r.startDate, r.endDate, r.policyRules?.countAs).includes(day),
              )
              .map((r) => r.memberId),
          ).size >= rules.maxOff,
      )
    )
      throw new AppError(409, 'The team availability limit has been reached for these dates.')
  }
  const candidate: LeaveRequest = {
    ...input,
    id: skipId ?? '__candidate__',
    workspaceId,
    memberId,
    halfDays: amount * 2,
    reason: '',
    status: 'approved',
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
    createdBy: '',
    createdAt: new Date(),
    attachmentId: input.attachmentId ?? null,
    policyId: policy?.id ?? null,
    policyRules: rules,
  }
  const after = balanceFor(
    { ...state, requests: [...state.requests.filter((r) => r.id !== skipId), candidate] },
    person,
    input.type,
    input.startDate,
  )
  if (after.remaining !== null && after.remaining < 0)
    throw new AppError(409, 'There is not enough leave balance for these dates.')
  return { halfDays: amount * 2, rules, policyId: policy?.id ?? null }
}
export async function saveLeavePolicy(db: Database, viewerId: string, raw: unknown) {
  const p = savePolicyInput.parse(raw)
  return db.transaction(async (tx) => {
    const a = await admin(tx, viewerId, p.workspaceId, true)
    const state = await leaveState(tx, p.workspaceId)
    const existing = state.policies.find((x) => x.id === p.id)
    if (!existing) {
      const [collision] = await tx
        .select({ id: leavePolicy.id })
        .from(leavePolicy)
        .where(eq(leavePolicy.id, p.id))
      if (collision) throw new AppError(409, 'This policy ID is already in use.')
    }
    if (existing && existing.version !== p.version)
      throw new AppError(409, 'This policy changed. Refresh before saving your changes.')
    if (!existing && p.version !== 0) throw new AppError(404, 'Leave policy not found.')
    if (existing && (existing.kind !== p.kind || existing.name !== p.name))
      throw new AppError(400, 'The policy name and type cannot change after creation.')
    if (p.kind === 'annual' && p.name !== 'Annual leave')
      throw new AppError(400, 'Use Annual leave for the annual policy.')
    if (
      state.policies.some(
        (x) =>
          x.id !== p.id &&
          (x.name.toLowerCase() === p.name.toLowerCase() ||
            (x.kind === 'annual' && p.kind === 'annual')),
      )
    )
      throw new AppError(409, 'A policy with this name already exists.')
    const today = dayInZone(new Date(), a.company.timeZone)
    if (
      p.kind === 'closure' &&
      ((existing && existing.rules.startDate <= today) || p.rules.startDate < today)
    )
      throw new AppError(409, 'Only future company closures can be changed or scheduled.')
    const effectiveFrom =
      existing && p.kind === 'annual'
        ? `${Number(today.slice(0, 4)) + 1}-01-01`
        : p.kind === 'annual'
          ? `${today.slice(0, 4)}-01-01`
          : today
    const revisions = [
      ...(existing?.revisions ?? []).filter((r) => r.effectiveFrom < effectiveFrom),
      { effectiveFrom, rules: p.rules },
    ]
    const coveredMemberIds =
      p.kind === 'closure'
        ? state.people.filter((m) => eligible(m, p.rules, p.rules.startDate)).map((m) => m.id)
        : []
    if (p.kind === 'closure' && p.active) {
      if (!dateDays(p.rules.startDate, p.rules.endDate, p.rules.countAs).length)
        throw new AppError(400, 'Choose at least one day for this closure.')
      if (!coveredMemberIds.length)
        throw new AppError(400, 'No active employees match this closure.')
      if (
        state.policies.some(
          (x) =>
            x.id !== p.id &&
            x.active &&
            x.kind === 'closure' &&
            x.rules.startDate <= p.rules.endDate &&
            x.rules.endDate >= p.rules.startDate &&
            x.coveredMemberIds.some((id) => coveredMemberIds.includes(id)),
        )
      )
        throw new AppError(409, 'This closure overlaps another closure for these employees.')
    }
    const values = {
      kind: p.kind,
      name: p.name,
      category: p.category,
      description: p.description,
      active: p.active,
      rules: p.rules,
      revisions,
      coveredMemberIds,
      version: (existing?.version ?? 0) + 1,
      updatedAt: new Date(),
    }
    const candidate = {
      ...existing,
      ...values,
      id: p.id,
      workspaceId: p.workspaceId,
      createdBy: viewerId,
      createdAt: existing?.createdAt ?? new Date(),
    } as LeavePolicy
    const next = { ...state, policies: [...state.policies.filter((x) => x.id !== p.id), candidate] }
    if (p.kind !== 'closure') {
      for (const person of state.people) {
        const dates = new Set([
          effectiveFrom,
          ...state.requests
            .filter((r) => r.memberId === person.id && r.type === p.name && r.status === 'approved')
            .map((r) => r.startDate),
        ])
        for (const date of dates) {
          const balance = balanceFor(next, person, p.name, date)
          if (balance.remaining !== null && balance.remaining < 0)
            throw new AppError(409, 'The allowance cannot be lower than leave already approved.')
        }
      }
    }
    if (p.kind === 'closure')
      for (const id of new Set([...coveredMemberIds, ...(existing?.coveredMemberIds ?? [])])) {
        const person = state.people.find((m) => m.id === id)!
        const dates = new Set([
          ...dateDays(p.rules.startDate, p.rules.endDate, p.rules.countAs),
          ...(existing
            ? dateDays(existing.rules.startDate, existing.rules.endDate, existing.rules.countAs)
            : []),
        ])
        for (const date of dates) {
          for (const type of new Set([
            'Annual leave',
            ...state.requests
              .filter((r) => r.memberId === id && r.status === 'approved')
              .map((r) => r.type),
          ])) {
            const balance = balanceFor(next, person, type, date)
            if (balance.remaining !== null && balance.remaining < 0)
              throw new AppError(
                409,
                `${person.name} does not have enough ${type.toLowerCase()} for this closure change.`,
              )
          }
        }
      }
    if (existing)
      await tx
        .update(leavePolicy)
        .set(values)
        .where(and(eq(leavePolicy.id, p.id), eq(leavePolicy.workspaceId, p.workspaceId)))
    else
      await tx
        .insert(leavePolicy)
        .values({ ...values, id: p.id, workspaceId: p.workspaceId, createdBy: viewerId })
    let cancelled = 0
    if (p.kind === 'closure' && p.active && p.rules.pendingRequests === 'Cancel automatically') {
      for (const r of state.requests.filter(
        (r) =>
          r.status === 'pending' &&
          coveredMemberIds.includes(r.memberId) &&
          r.startDate <= p.rules.endDate &&
          r.endDate >= p.rules.startDate,
      )) {
        await tx
          .update(employeeLeave)
          .set({
            status: 'cancelled',
            reviewedBy: viewerId,
            reviewedAt: new Date(),
            rejectionReason: `Company closure: ${p.name}`,
          })
          .where(eq(employeeLeave.id, r.id))
        await detailAudit(tx, p.workspaceId, viewerId, 'leave.cancelled_by_closure', r.id)
        cancelled++
      }
    }
    await detailAudit(
      tx,
      p.workspaceId,
      viewerId,
      existing ? 'leave.policy_updated' : 'leave.policy_created',
      p.id,
    )
    return { ok: true, effectiveFrom, cancelled, version: values.version }
  })
}
