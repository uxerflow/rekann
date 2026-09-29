import { and, eq, ne, gt } from 'drizzle-orm'
import type { Database, Transaction } from './db'
import { employeeRecord, workspaceMember, user, invitation, auditEvent } from './schema'
import { AppError, authorize, canManage } from './workspaces'
import { saveEmployeeInput, employeeFields } from '../shared/employee-input'

export async function authorizeEmployee(
  db: Database | Transaction,
  userId: string,
  workspaceId: string,
  lock = false,
) {
  const access = await authorize(db, userId, workspaceId, lock)
  if (!canManage(access.employee.role, access.company, 'invite_employees'))
    throw new AppError(403, 'You do not have permission to add employees.')
  return access
}
export async function employeeDetails(
  db: Database | Transaction,
  userId: string,
  workspaceId: string,
  id: string,
) {
  const { employee } = await authorizeEmployee(db, userId, workspaceId)
  const [record] = await db
    .select()
    .from(employeeRecord)
    .where(and(eq(employeeRecord.workspaceId, workspaceId), eq(employeeRecord.id, id)))
  if (!record) throw new AppError(404, 'Employee not found.')
  if (employee.role !== 'admin' && record.createdBy !== userId)
    throw new AppError(403, 'You cannot access this employee record.')
  const [invite] = record.invitationId
    ? await db
        .select({
          status: invitation.status,
          delivery: invitation.delivery,
          expiresAt: invitation.expiresAt,
        })
        .from(invitation)
        .where(and(eq(invitation.id, record.invitationId), eq(invitation.workspaceId, workspaceId)))
    : []
  return { ...record, invite: invite ?? null }
}
export type EmployeeDetails = Awaited<ReturnType<typeof employeeDetails>>
export async function employeeOptions(
  db: Database | Transaction,
  userId: string,
  workspaceId: string,
) {
  const { company, employee } = await authorizeEmployee(db, userId, workspaceId)
  const members = await db
    .select({
      id: workspaceMember.id,
      firstName: workspaceMember.firstName,
      lastName: workspaceMember.lastName,
      department: workspaceMember.department,
      role: workspaceMember.role,
      email: user.email,
      accountName: user.name,
    })
    .from(workspaceMember)
    .innerJoin(user, eq(user.id, workspaceMember.userId))
    .where(and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.status, 'active')))
  const records = await db
    .select({ fields: employeeRecord.fields })
    .from(employeeRecord)
    .where(eq(employeeRecord.workspaceId, workspaceId))
  return {
    departments: [
      ...new Set(
        [...members.map((m) => m.department), ...records.map((r) => r.fields.department)].filter(
          (s): s is string => !!s,
        ),
      ),
    ].sort(),
    locations: [...new Set(records.map((r) => r.fields.workLocation).filter(Boolean))].sort(),
    schedules: [...new Set(records.map((r) => r.fields.workSchedule).filter(Boolean))].sort(),
    managers: members
      .filter((m) => m.role !== 'employee')
      .map((m) => ({
        id: m.id,
        name: [m.firstName, m.lastName].filter(Boolean).join(' ') || m.accountName,
        email: m.email,
      })),
    allowManager: employee.role === 'admin' && company.managersEnabled,
  }
}
export async function saveEmployee(db: Database | Transaction, userId: string, raw: unknown) {
  const input = saveEmployeeInput.parse(raw)
  return db.transaction(async (tx) => {
    const { company, employee } = await authorizeEmployee(tx, userId, input.workspaceId, true)
    const [existing] = await tx.select().from(employeeRecord).where(eq(employeeRecord.id, input.id))
    if (
      existing &&
      (existing.workspaceId !== input.workspaceId ||
        (employee.role !== 'admin' && existing.createdBy !== userId))
    )
      throw new AppError(403, 'You cannot edit this employee record.')
    if (existing?.memberId)
      throw new AppError(409, 'This employee has joined. Edit their member profile instead.')
    if (existing?.invitationId)
      throw new AppError(
        409,
        'An invitation already exists. Finish this invitation before changing employee details.',
      )
    // Repeated identical submissions return the saved record, including a lost response retry.
    if (
      existing &&
      existing.status === input.status &&
      JSON.stringify(employeeFields.parse(existing.fields)) === JSON.stringify(input.fields)
    )
      return { id: existing.id, version: existing.version }
    if ((existing?.version ?? 0) !== input.version)
      throw new AppError(409, 'This draft changed in another tab. Reload it before editing.')
    if (input.fields.role === 'manager' && (employee.role !== 'admin' || !company.managersEnabled))
      throw new AppError(403, 'Only admins can assign an enabled Manager / HR role.')
    if (!existing) {
      const [pending] = await tx
        .select({ id: invitation.id })
        .from(invitation)
        .where(
          and(
            eq(invitation.workspaceId, input.workspaceId),
            eq(invitation.email, input.fields.email),
            eq(invitation.status, 'pending'),
            gt(invitation.expiresAt, new Date()),
          ),
        )
      if (pending)
        throw new AppError(
          409,
          'This email already has a pending invitation. Manage it in Team access before adding an employee record.',
        )
    }
    const others = await tx
      .select({
        id: employeeRecord.id,
        email: employeeRecord.email,
        employeeNumber: employeeRecord.employeeNumber,
      })
      .from(employeeRecord)
      .where(
        and(eq(employeeRecord.workspaceId, input.workspaceId), ne(employeeRecord.id, input.id)),
      )
    const members = await tx
      .select({ email: user.email, employeeNumber: workspaceMember.employeeNumber })
      .from(workspaceMember)
      .innerJoin(user, eq(user.id, workspaceMember.userId))
      .where(eq(workspaceMember.workspaceId, input.workspaceId))
    if ([...others, ...members].some((p) => p.email.toLowerCase() === input.fields.email))
      throw new AppError(409, 'An employee with this email already exists in this workspace.')
    if (
      [...others, ...members].some(
        (p) => p.employeeNumber?.toLowerCase() === input.fields.employeeNumber.toLowerCase(),
      )
    )
      throw new AppError(
        409,
        'This employee ID is already in use. Choose another or generate a new ID.',
      )
    if (input.fields.reportingManagerId) {
      const [manager] = await tx
        .select()
        .from(workspaceMember)
        .where(
          and(
            eq(workspaceMember.id, input.fields.reportingManagerId),
            eq(workspaceMember.workspaceId, input.workspaceId),
            eq(workspaceMember.status, 'active'),
          ),
        )
      if (!manager || manager.role === 'employee')
        throw new AppError(400, 'Choose an active manager in this workspace.')
    }
    const values = {
      fields: input.fields,
      email: input.fields.email,
      employeeNumber: input.fields.employeeNumber,
      status: input.status,
      version: input.version + 1,
      updatedAt: new Date(),
    }
    if (existing) await tx.update(employeeRecord).set(values).where(eq(employeeRecord.id, input.id))
    else
      await tx
        .insert(employeeRecord)
        .values({ id: input.id, workspaceId: input.workspaceId, createdBy: userId, ...values })
    await tx.insert(auditEvent).values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      actorId: userId,
      action: input.status === 'draft' ? 'employee.draft_saved' : 'employee.created',
      targetId: input.id,
    })
    return { id: input.id, version: values.version }
  })
}
export async function nextEmployeeNumber(
  db: Database | Transaction,
  userId: string,
  workspaceId: string,
) {
  await authorizeEmployee(db, userId, workspaceId)
  const records = await db
    .select({ n: employeeRecord.employeeNumber })
    .from(employeeRecord)
    .where(eq(employeeRecord.workspaceId, workspaceId))
  const members = await db
    .select({ n: workspaceMember.employeeNumber })
    .from(workspaceMember)
    .where(eq(workspaceMember.workspaceId, workspaceId))
  const used = new Set([...records, ...members].map((r) => r.n?.toUpperCase()))
  let n = 1001
  while (used.has(`EMP${n}`)) n++
  return { employeeNumber: `EMP${n}` }
}
