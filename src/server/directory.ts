import { and, eq } from 'drizzle-orm'
import type { Database, Transaction } from './db'
import { user, workspaceMember, employeeRecord } from './schema'
import { authorize, AppError, canManage } from './workspaces'

// The directory exposes work identity only. Personal/contact records belong to
// the separately authorized member-detail flow.
export async function directoryEmployees(
  db: Database | Transaction,
  viewerId: string,
  workspaceId: string,
  includeInactive = false,
) {
  if (!workspaceId || workspaceId.length > 100) throw new AppError(400, 'Choose a workspace.')
  const { company, employee } = await authorize(db, viewerId, workspaceId)
  const members = await db
    .select({
      id: workspaceMember.id,
      status: workspaceMember.status,
      firstName: workspaceMember.firstName,
      lastName: workspaceMember.lastName,
      email: user.email,
      avatarKey: workspaceMember.avatarKey,
      jobTitle: workspaceMember.jobTitle,
      role: workspaceMember.role,
      employeeNumber: workspaceMember.employeeNumber,
      department: workspaceMember.department,
      employmentType: workspaceMember.employmentType,
      startDate: workspaceMember.startDate,
    })
    .from(workspaceMember)
    .innerJoin(user, eq(user.id, workspaceMember.userId))
    .where(
      and(
        eq(workspaceMember.workspaceId, workspaceId),
        employee.role === 'admin' && includeInactive
          ? undefined
          : eq(workspaceMember.status, 'active'),
      ),
    )
    .orderBy(workspaceMember.createdAt, workspaceMember.id)
  const rows: ((typeof members)[number] & {
    recordId?: string
    recordStatus?: 'draft' | 'ready'
    status?: 'active' | 'removed'
  })[] = members.map((m) => ({ ...m, recordId: m.id }))
  if (canManage(employee.role, company, 'invite_employees')) {
    const records = await db
      .select()
      .from(employeeRecord)
      .where(eq(employeeRecord.workspaceId, workspaceId))
    for (const r of records) {
      if (employee.role !== 'admin' && r.createdBy !== viewerId) continue
      if (r.memberId) {
        const linked = rows.find((m) => m.id === r.memberId)
        if (linked) linked.recordId = r.id
        continue
      }
      const [firstName, ...rest] = r.fields.fullName.split(/\s+/)
      rows.push({
        id: r.id,
        status: r.inactiveAt ? 'removed' : 'active',
        recordId: r.id,
        recordStatus: r.status,
        firstName,
        lastName: rest.join(' '),
        email: r.email,
        employeeNumber: r.employeeNumber,
        avatarKey: r.avatarKey,
        department: r.fields.department || null,
        jobTitle: r.fields.jobTitle,
        employmentType: r.fields.employmentType || null,
        startDate: r.fields.startDate || null,
        role: r.fields.role,
      })
    }
  }
  return rows
}
type DirectoryRow = Awaited<ReturnType<typeof directoryEmployees>>[number]
export type DirectoryEmployee = Omit<DirectoryRow, 'status'> & { status?: 'active' | 'removed' }
