import { and, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { Database, Transaction } from './db'
import { employeeAttendance, employeeLeave, employeeAllowance, employeeDocument } from './schema'
import { checkLeavePolicy, chargedDays, leaveState, balanceFor } from './leaves'
import { AppError } from './workspaces'
import { detailAccess, detailAudit } from './employee-detail'
import { eligible } from '../shared/leaves'
import { dayInZone, detailScope, leaveInput, leaveTypes } from '../shared/employee-detail'

async function timeAccess(
  db: Database | Transaction,
  viewerId: string,
  workspaceId: string,
  id: string,
  lock = false,
) {
  const a = await detailAccess(db, viewerId, workspaceId, id, lock)
  if (!a.member || !a.canPrivate)
    throw new AppError(403, 'You cannot access this employee’s time records.')
  return { ...a, member: a.member }
}
export async function employeeTime(
  db: Database,
  viewerId: string,
  workspaceId: string,
  id: string,
  month: string,
) {
  const a = await timeAccess(db, viewerId, workspaceId, id)
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new AppError(400, 'Choose a valid month.')
  const records = await db
    .select()
    .from(employeeAttendance)
    .where(
      and(
        eq(employeeAttendance.workspaceId, workspaceId),
        eq(employeeAttendance.memberId, a.member.id),
      ),
    )
    .orderBy(desc(employeeAttendance.clockIn))
  const monthly = records.filter((r) => dayInZone(r.clockIn, a.company.timeZone).startsWith(month))
  const complete = monthly.filter((r) => r.clockOut)
  const seconds = complete.reduce(
    (sum, r) => sum + (r.clockOut!.getTime() - r.clockIn.getTime()) / 1000,
    0,
  )
  const days = new Set(complete.map((r) => dayInZone(r.clockIn, a.company.timeZone))).size
  const leaves = await db
    .select()
    .from(employeeLeave)
    .where(and(eq(employeeLeave.workspaceId, workspaceId), eq(employeeLeave.memberId, a.member.id)))
    .orderBy(desc(employeeLeave.createdAt))
  const allowances = await db
    .select()
    .from(employeeAllowance)
    .where(
      and(
        eq(employeeAllowance.workspaceId, workspaceId),
        eq(employeeAllowance.memberId, a.member.id),
      ),
    )
  const policyState = await leaveState(db, workspaceId)
  const year = month.slice(0, 4)
  const person = policyState.people.find((person) => person.id === a.member.id)!
  const allowanceRows = [...allowances]
  for (const policy of policyState.policies.filter((p) => p.kind !== 'closure')) {
    const balance = balanceFor(policyState, person, policy.name, `${month}-01`)
    if (
      balance.rules &&
      eligible(person, balance.rules, `${month}-01`) &&
      !allowanceRows.some((r) => r.type === policy.name && r.year === Number(year))
    )
      allowanceRows.push({
        id: policy.id,
        workspaceId,
        memberId: a.member.id,
        type: policy.name,
        year: Number(year),
        halfDays: (balance.allowance ?? 0) * 2,
      })
  }
  const annual = records.filter((r) => dayInZone(r.clockIn, a.company.timeZone).startsWith(year))
  return {
    records: monthly,
    openRecord: records.find((r) => !r.clockOut) || null,
    totalSeconds: seconds,
    averageSeconds: days ? seconds / days : 0,
    leaves,
    allowances: allowanceRows.map((r) => {
      const balance = balanceFor(
        policyState,
        person,
        r.type,
        `${r.year}-${r.year === Number(year) ? month.slice(5) : '01'}-01`,
      )
      return {
        ...r,
        halfDays: ((balance.allowance ?? 0) + balance.carried) * 2,
        usedHalfDays: balance.used * 2,
        unlimited: balance.allowance === null,
      }
    }),
    statistics: {
      present: new Set(annual.map((r) => dayInZone(r.clockIn, a.company.timeZone))).size,
      // Free-text work schedules do not define a clock-in cutoff yet.
      late: null as number | null,
      leaves: leaves
        .filter((r) => r.status === 'approved' && r.startDate.startsWith(year))
        .reduce((s, r) => s + r.halfDays / 2, 0),
    },
  }
}
export type EmployeeTime = Awaited<ReturnType<typeof employeeTime>>
export async function recordEmployeeLeave(db: Database, viewerId: string, raw: unknown) {
  const p = leaveInput.parse(raw)
  return db.transaction(async (tx) => {
    const a = await timeAccess(tx, viewerId, p.workspaceId, p.id, true)
    if (!a.canEdit && !a.self) throw new AppError(403, 'You cannot record this leave.')
    if (a.member.status !== 'active' || a.record?.inactiveAt)
      throw new AppError(409, 'Reactivate this employee before recording time off.')
    const [existing] = await tx
      .select()
      .from(employeeLeave)
      .where(eq(employeeLeave.id, p.requestId))
    if (existing) {
      if (
        existing.workspaceId !== p.workspaceId ||
        existing.memberId !== a.member.id ||
        existing.createdBy !== viewerId
      )
        throw new AppError(409, 'This request ID is already in use.')
      if (
        existing.type !== p.type ||
        existing.startDate !== p.startDate ||
        existing.endDate !== p.endDate ||
        existing.duration !== p.duration ||
        existing.reason !== p.reason ||
        existing.attachmentId !== (p.attachmentId || null)
      )
        throw new AppError(409, 'This request has already been saved. Refresh before changing it.')
      return { ok: true }
    }
    const overlapping = await tx
      .select()
      .from(employeeLeave)
      .where(
        and(eq(employeeLeave.workspaceId, p.workspaceId), eq(employeeLeave.memberId, a.member.id)),
      )
    if (
      overlapping.some(
        (r) =>
          ['pending', 'approved'].includes(r.status) &&
          r.startDate <= p.endDate &&
          r.endDate >= p.startDate,
      )
    )
      throw new AppError(409, 'These dates overlap an existing leave request.')
    if (p.attachmentId) {
      const [doc] = await tx
        .select()
        .from(employeeDocument)
        .where(
          and(
            eq(employeeDocument.id, p.attachmentId),
            eq(employeeDocument.workspaceId, p.workspaceId),
            eq(employeeDocument.memberId, a.member.id),
            isNull(employeeDocument.deletedAt),
          ),
        )
      if (!doc || (a.self && !doc.visibleToEmployee))
        throw new AppError(400, 'Choose an accessible employee document.')
    }
    const checked = await checkLeavePolicy(
      tx,
      p.workspaceId,
      a.member.id,
      p,
      dayInZone(new Date(), a.company.timeZone),
    )
    const halfDays = checked.halfDays
    const pending = a.self && checked.rules?.approval !== false
    await tx.insert(employeeLeave).values({
      id: p.requestId,
      workspaceId: p.workspaceId,
      memberId: a.member.id,
      type: p.type,
      startDate: p.startDate,
      endDate: p.endDate,
      halfDays,
      duration: p.duration,
      reason: p.reason,
      policyId: checked.policyId,
      policyRules: checked.rules,
      status: pending ? 'pending' : 'approved',
      reviewedBy: pending ? null : viewerId,
      reviewedAt: pending ? null : new Date(),
      createdBy: viewerId,
      attachmentId: p.attachmentId,
    })
    await detailAudit(
      tx,
      p.workspaceId,
      viewerId,
      a.self ? 'leave.requested' : 'leave.recorded',
      p.requestId,
    )
    return { ok: true }
  })
}
export async function reviewEmployeeLeave(db: Database, viewerId: string, raw: unknown) {
  const p = detailScope
    .extend({
      requestId: z.uuid(),
      action: z.enum(['approve', 'reject', 'cancel']),
      reason: z.string().trim().max(2000).default(''),
    })
    .parse(raw)
  if (p.action === 'reject' && !p.reason)
    throw new AppError(400, 'Enter a reason for rejecting this request.')
  return db.transaction(async (tx) => {
    const a = await timeAccess(tx, viewerId, p.workspaceId, p.id, true)
    if (p.action !== 'cancel' && (!a.canEdit || a.self))
      throw new AppError(403, 'You cannot review your own leave request.')
    if (p.action === 'cancel' && !a.canEdit && !a.self)
      throw new AppError(403, 'You cannot cancel this leave.')
    const [r] = await tx
      .select()
      .from(employeeLeave)
      .where(
        and(
          eq(employeeLeave.id, p.requestId),
          eq(employeeLeave.workspaceId, p.workspaceId),
          eq(employeeLeave.memberId, a.member.id),
        ),
      )
      .for('update')
    if (!r) throw new AppError(404, 'Leave request not found.')
    if (p.action !== 'cancel' && r.policyRules?.approval) {
      if (r.policyRules.approver === 'Owner' && a.company.createdBy !== viewerId)
        throw new AppError(403, 'The workspace owner must review this request.')
      if (r.policyRules.approver === 'HR Admin' && !a.admin)
        throw new AppError(403, 'An admin must review this request.')
    }
    const status =
      p.action === 'approve' ? 'approved' : p.action === 'reject' ? 'rejected' : 'cancelled'
    if (r.status === status) return { ok: true }
    if (
      (p.action === 'cancel' && !['approved', 'pending'].includes(r.status)) ||
      (p.action !== 'cancel' && r.status !== 'pending')
    )
      throw new AppError(
        409,
        'This request has already been reviewed. Refresh to see its current status.',
      )
    if (p.action === 'approve')
      await checkLeavePolicy(
        tx,
        p.workspaceId,
        a.member.id,
        r,
        dayInZone(new Date(), a.company.timeZone),
        r.id,
        r.policyRules,
      )
    await tx
      .update(employeeLeave)
      .set({
        status,
        rejectionReason: p.action === 'reject' ? p.reason : null,
        reviewedBy: viewerId,
        reviewedAt: new Date(),
      })
      .where(eq(employeeLeave.id, r.id))
    await detailAudit(tx, p.workspaceId, viewerId, `leave.${status}`, r.id)
    return { ok: true }
  })
}
export async function saveEmployeeAllowance(db: Database, viewerId: string, raw: unknown) {
  const p = detailScope
    .extend({
      year: z.number().int().min(2000).max(2200),
      type: z.enum(leaveTypes),
      days: z.number().min(0).max(366).multipleOf(0.5),
    })
    .parse(raw)
  return db.transaction(async (tx) => {
    const a = await timeAccess(tx, viewerId, p.workspaceId, p.id, true)
    if (!a.admin) throw new AppError(403, 'Only an admin can set leave allowances.')
    const leaves = await tx
      .select()
      .from(employeeLeave)
      .where(
        and(
          eq(employeeLeave.workspaceId, p.workspaceId),
          eq(employeeLeave.memberId, a.member.id),
          eq(employeeLeave.type, p.type),
          eq(employeeLeave.status, 'approved'),
        ),
      )
    const policyState = await leaveState(tx, p.workspaceId)
    const person = policyState.people.find((person) => person.id === a.member.id)!
    const currentUsage = balanceFor(policyState, person, p.type, `${p.year}-01-01`).used
    if (
      currentUsage > p.days ||
      leaves
        .filter((r) => r.startDate.startsWith(String(p.year)))
        .reduce((s, r) => s + chargedDays(r, policyState.policies) * 2, 0) >
        p.days * 2
    )
      throw new AppError(409, 'The allowance cannot be lower than leave already taken.')
    await tx
      .insert(employeeAllowance)
      .values({
        id: crypto.randomUUID(),
        workspaceId: p.workspaceId,
        memberId: a.member.id,
        year: p.year,
        type: p.type,
        halfDays: p.days * 2,
      })
      .onConflictDoUpdate({
        target: [
          employeeAllowance.workspaceId,
          employeeAllowance.memberId,
          employeeAllowance.year,
          employeeAllowance.type,
        ],
        set: { halfDays: p.days * 2 },
      })
    await detailAudit(tx, p.workspaceId, viewerId, 'leave.allowance_updated', a.member.id)
    return { ok: true }
  })
}
// Shared attendance persistence for personal clock-in/out. Manager views only read it.
export async function clockEmployee(db: Database, viewerId: string, raw: unknown) {
  const p = detailScope.extend({ action: z.enum(['in', 'out']), attendanceId: z.uuid() }).parse(raw)
  return db.transaction(async (tx) => {
    const a = await timeAccess(tx, viewerId, p.workspaceId, p.id, true)
    if (!a.self || a.member.status !== 'active')
      throw new AppError(403, 'You can record your own attendance only.')
    const [existing] = await tx
      .select()
      .from(employeeAttendance)
      .where(eq(employeeAttendance.id, p.attendanceId))
    if (existing && (existing.workspaceId !== p.workspaceId || existing.memberId !== a.member.id))
      throw new AppError(409, 'This attendance ID is already in use.')
    if (p.action === 'in') {
      if (existing) return { ok: true }
      const [open] = await tx
        .select()
        .from(employeeAttendance)
        .where(
          and(eq(employeeAttendance.memberId, a.member.id), isNull(employeeAttendance.clockOut)),
        )
      if (open) throw new AppError(409, 'You are already clocked in.')
      await tx.insert(employeeAttendance).values({
        id: p.attendanceId,
        workspaceId: p.workspaceId,
        memberId: a.member.id,
        clockIn: new Date(),
      })
    } else {
      if (!existing) throw new AppError(409, 'Clock in before clocking out.')
      if (!existing.clockOut)
        await tx
          .update(employeeAttendance)
          .set({ clockOut: new Date() })
          .where(eq(employeeAttendance.id, p.attendanceId))
    }
    return { ok: true }
  })
}
