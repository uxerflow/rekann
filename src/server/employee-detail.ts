import { and, eq, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Database, Transaction } from './db'
import { employeeRecord, workspaceMember, user, invitation, auditEvent } from './schema'
import { authorize, AppError } from './workspaces'
import { emptyEmployee, employeeFields, type EmployeeFields } from '../shared/employee-input'
import { detailPatch, detailScope, sectionFields } from '../shared/employee-detail'

type Db = Database | Transaction
export async function detailAccess(
  db: Db,
  viewerId: string,
  workspaceId: string,
  id: string,
  lock = false,
) {
  const access = await authorize(db, viewerId, workspaceId, lock)
  const [record] = await db
    .select()
    .from(employeeRecord)
    .where(
      and(
        eq(employeeRecord.workspaceId, workspaceId),
        or(eq(employeeRecord.id, id), eq(employeeRecord.memberId, id)),
      ),
    )
  const [member] = await db
    .select()
    .from(workspaceMember)
    .where(
      and(
        eq(workspaceMember.workspaceId, workspaceId),
        eq(workspaceMember.id, record?.memberId ?? id),
      ),
    )
  if (!record && !member) throw new AppError(404, 'Employee not found.')
  const self = member?.userId === viewerId
  const admin = access.employee.role === 'admin'
  const manager =
    access.employee.role === 'manager' &&
    access.company.managersEnabled &&
    record?.fields.reportingManagerId === access.employee.id &&
    member?.role === 'employee'
  const creator =
    !member &&
    record?.createdBy === viewerId &&
    access.employee.role === 'manager' &&
    access.company.managersEnabled &&
    access.company.managerPermissions.includes('invite_employees')
  if (!member && !admin && !creator)
    throw new AppError(403, 'You cannot access this employee record.')
  if (member?.status === 'removed' && !admin && !manager)
    throw new AppError(403, 'You cannot access this employee record.')
  return {
    ...access,
    record,
    member,
    self,
    admin,
    manager,
    canEdit: admin || manager || !!creator,
    canPrivate: admin || manager || self || !!creator,
  }
}
export async function detailFields(
  db: Db,
  access: Awaited<ReturnType<typeof detailAccess>>,
): Promise<EmployeeFields> {
  const { record, member } = access
  const [person] = member ? await db.select().from(user).where(eq(user.id, member.userId)) : []
  return {
    ...emptyEmployee,
    ...record?.fields,
    ...(member
      ? {
          fullName:
            [member.firstName, member.lastName].filter(Boolean).join(' ') || person?.name || '',
          email: person?.email || '',
          employeeNumber: member.employeeNumber || '',
          jobTitle: member.jobTitle,
          department: member.department || '',
          employmentType: member.employmentType || '',
          startDate: member.startDate || '',
          phone: member.phone,
          birthPlace: member.birthPlace,
          birthDate: member.birthDate || '',
          role: member.role === 'manager' ? ('manager' as const) : ('employee' as const),
        }
      : {}),
  }
}
export async function getEmployeeDetail(
  db: Database | Transaction,
  viewerId: string,
  workspaceId: string,
  id: string,
) {
  const a = await detailAccess(db, viewerId, workspaceId, id)
  const fields = await detailFields(db, a)
  if (!a.canPrivate) {
    const publicFields = {
      fullName: fields.fullName,
      email: fields.email,
      employeeNumber: fields.employeeNumber,
      department: fields.department,
      jobTitle: fields.jobTitle,
      employmentType: fields.employmentType,
      startDate: fields.startDate,
      workLocation: fields.workLocation,
      workSchedule: fields.workSchedule,
      role: fields.role,
    }
    Object.assign(fields, emptyEmployee, publicFields)
  }
  const [invite] = a.record?.invitationId
    ? await db
        .select({
          status: invitation.status,
          delivery: invitation.delivery,
          expiresAt: invitation.expiresAt,
        })
        .from(invitation)
        .where(eq(invitation.id, a.record.invitationId))
    : []
  return {
    id: a.record?.id || a.member!.id,
    memberId: a.member?.id || null,
    fields,
    avatarKey: a.member?.avatarKey ?? a.record?.avatarKey ?? null,
    version: a.record?.version || 0,
    status: a.record?.status || 'ready',
    inactive: a.record ? !!a.record.inactiveAt : a.member?.status === 'removed',
    accountActive: a.member?.status === 'active',
    invite: invite || null,
    additionalContact: a.canPrivate ? a.record?.additionalContact || null : null,
    role: a.member?.role || fields.role,
    permissions: {
      edit: a.canEdit,
      private: a.canPrivate,
      self: !!a.self,
      admin: a.admin,
      review: (a.admin || a.manager) && !a.self,
    },
  }
}
export type EmployeeDetail = Awaited<ReturnType<typeof getEmployeeDetail>>
export async function ensureDetailRecord(
  db: Db,
  viewerId: string,
  a: Awaited<ReturnType<typeof detailAccess>>,
) {
  if (a.record) return a.record
  const fields = await detailFields(db, a)
  // Legacy memberships may not yet have an HR ID. Use the membership ID as the
  // unique storage key until an administrator assigns a display employee ID.
  const [created] = await db
    .insert(employeeRecord)
    .values({
      id: a.member!.id,
      workspaceId: a.company.id,
      memberId: a.member!.id,
      createdBy: viewerId,
      status: 'ready',
      email: fields.email,
      employeeNumber: fields.employeeNumber || a.member!.id,
      fields,
    })
    .returning()
  return created
}
export async function detailAudit(
  db: Db,
  workspaceId: string,
  actorId: string,
  action: string,
  targetId: string,
) {
  await db
    .insert(auditEvent)
    .values({ id: crypto.randomUUID(), workspaceId, actorId, action, targetId })
}
export async function patchEmployeeDetail(
  db: Database | Transaction,
  viewerId: string,
  raw: unknown,
  bucket?: R2Bucket,
) {
  const p = detailPatch.parse(raw)
  if (p.photo !== undefined && p.section !== 'profile')
    throw new AppError(400, 'Choose the profile section.')
  if (p.photo !== undefined && !bucket) throw new AppError(503, 'Image storage is not configured.')
  const image = p.photo !== undefined ? employeePhoto(p.photo) : null
  const key = p.photo ? `${p.workspaceId}/${crypto.randomUUID()}.${image!.format}` : null
  let old: string | null = null
  try {
    await db.transaction(async (tx) => {
      const a = await detailAccess(tx, viewerId, p.workspaceId, p.id, true)
      if (
        !a.canEdit &&
        !(a.self && ['profile', 'personal', 'address', 'emergency'].includes(p.section))
      )
        throw new AppError(403, 'You cannot edit this information.')
      if (
        Object.keys(p.fields).some(
          (k) => !(sectionFields[p.section] as readonly string[]).includes(k),
        )
      )
        throw new AppError(400, 'This field does not belong to this section.')
      if (p.additionalContact && p.section !== 'emergency')
        throw new AppError(400, 'Choose the emergency contact section.')
      const current = await detailFields(tx, a)
      if (a.member && p.fields.email && p.fields.email !== current.email)
        throw new AppError(400, 'The account email cannot be changed from an employee profile.')
      if (a.record?.invitationId && !a.member && p.fields.email && p.fields.email !== current.email)
        throw new AppError(409, 'Revoke the pending invitation before changing this email.')
      const merged = { ...current, ...p.fields }
      // Legacy members can leave the employee ID empty until work information is edited.
      const fields = employeeFields.parse({
        ...merged,
        employeeNumber: merged.employeeNumber || a.member?.id,
      })
      if (!merged.employeeNumber) fields.employeeNumber = ''
      if (fields.reportingManagerId) {
        const [manager] = await tx
          .select()
          .from(workspaceMember)
          .where(
            and(
              eq(workspaceMember.id, fields.reportingManagerId),
              eq(workspaceMember.workspaceId, p.workspaceId),
              eq(workspaceMember.status, 'active'),
            ),
          )
        if (!manager || manager.role === 'employee' || manager.id === a.member?.id)
          throw new AppError(400, 'Choose another active manager in this workspace.')
      }
      if (fields.employeeNumber) {
        const [duplicate] = await tx
          .select({ id: workspaceMember.id })
          .from(workspaceMember)
          .where(
            and(
              eq(workspaceMember.workspaceId, p.workspaceId),
              sql`lower(${workspaceMember.employeeNumber}) = ${fields.employeeNumber.toLowerCase()}`,
              ne(workspaceMember.id, a.member?.id || ''),
            ),
          )
        const [draft] = await tx
          .select({ id: employeeRecord.id })
          .from(employeeRecord)
          .where(
            and(
              eq(employeeRecord.workspaceId, p.workspaceId),
              sql`lower(${employeeRecord.employeeNumber}) = ${fields.employeeNumber.toLowerCase()}`,
              ne(employeeRecord.id, a.record?.id || ''),
            ),
          )
        if (duplicate || draft) throw new AppError(409, 'This employee ID is already in use.')
      }
      if (p.fields.email && !a.member && p.fields.email !== current.email) {
        const [duplicate] = await tx
          .select({ id: employeeRecord.id })
          .from(employeeRecord)
          .where(
            and(
              eq(employeeRecord.workspaceId, p.workspaceId),
              eq(employeeRecord.email, fields.email),
              ne(employeeRecord.id, a.record!.id),
            ),
          )
        const [account] = await tx
          .select({ id: workspaceMember.id })
          .from(workspaceMember)
          .innerJoin(user, eq(user.id, workspaceMember.userId))
          .where(and(eq(workspaceMember.workspaceId, p.workspaceId), eq(user.email, fields.email)))
        if (duplicate || account) throw new AppError(409, 'This email is already in use.')
      }
      if ((a.record?.version || 0) !== p.version)
        throw new AppError(
          409,
          'This profile changed in another tab. Close this dialog and refresh before editing.',
        )
      const record = await ensureDetailRecord(tx, viewerId, a)
      if (image) {
        if (key)
          await bucket!.put(key, image.bytes, {
            httpMetadata: { contentType: `image/${image.format}` },
          })
        old = a.member?.avatarKey || record.avatarKey
      }
      await tx
        .update(employeeRecord)
        .set({
          fields,
          email: fields.email,
          employeeNumber: fields.employeeNumber || record.employeeNumber,
          additionalContact: p.additionalContact ?? record.additionalContact,
          ...(image ? { avatarKey: key } : {}),
          version: record.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(employeeRecord.id, record.id))
      if (a.member) {
        const [firstName, ...rest] = fields.fullName.split(/\s+/)
        await tx
          .update(workspaceMember)
          .set({
            ...(image ? { avatarKey: key } : {}),
            firstName,
            lastName: rest.join(' '),
            phone: fields.phone,
            jobTitle: fields.jobTitle,
            department: fields.department || null,
            employmentType: fields.employmentType || null,
            startDate: fields.startDate || null,
            employeeNumber: fields.employeeNumber || null,
            birthPlace: fields.birthPlace,
            birthDate: fields.birthDate || null,
            updatedAt: new Date(),
          })
          .where(eq(workspaceMember.id, a.member.id))
      }
      await detailAudit(tx, p.workspaceId, viewerId, `employee.${p.section}_updated`, record.id)
    })
  } catch (error) {
    if (key) await bucket!.delete(key).catch(() => {})
    throw error
  }
  if (old) await bucket!.delete(old).catch(() => {})
  return { ok: true }
}
export async function setEmployeeActive(
  db: Database | Transaction,
  viewerId: string,
  raw: unknown,
) {
  const p = detailScope.extend({ active: z.boolean() }).parse(raw)
  return db.transaction(async (tx) => {
    const a = await detailAccess(tx, viewerId, p.workspaceId, p.id, true)
    if (!a.admin || a.self)
      throw new AppError(403, 'An admin can change access for other employees only.')
    if (a.member?.role === 'admin') {
      const admins = await tx
        .select({ id: workspaceMember.id })
        .from(workspaceMember)
        .where(
          and(
            eq(workspaceMember.workspaceId, p.workspaceId),
            eq(workspaceMember.role, 'admin'),
            eq(workspaceMember.status, 'active'),
          ),
        )
      if (!p.active && admins.length <= 1)
        throw new AppError(409, 'Your workspace must have at least one admin.')
    }
    const r = await ensureDetailRecord(tx, viewerId, a)
    await tx
      .update(employeeRecord)
      .set({ inactiveAt: p.active ? null : new Date(), version: r.version + 1 })
      .where(eq(employeeRecord.id, r.id))
    if (!p.active) {
      if (a.member)
        await tx
          .update(workspaceMember)
          .set({ status: 'removed', updatedAt: new Date() })
          .where(eq(workspaceMember.id, a.member.id))
      await tx
        .update(invitation)
        .set({ status: 'revoked' })
        .where(
          and(
            eq(invitation.workspaceId, p.workspaceId),
            eq(invitation.email, r.email),
            eq(invitation.status, 'pending'),
          ),
        )
    }
    await detailAudit(
      tx,
      p.workspaceId,
      viewerId,
      p.active ? 'employee.reactivated' : 'employee.deactivated',
      r.id,
    )
    return { ok: true }
  })
}

export async function detailOptions(
  db: Database | Transaction,
  viewerId: string,
  workspaceId: string,
  id: string,
) {
  const a = await detailAccess(db, viewerId, workspaceId, id)
  if (!a.canEdit) throw new AppError(403, 'You cannot edit this employee.')
  const members = await db
    .select({
      id: workspaceMember.id,
      firstName: workspaceMember.firstName,
      lastName: workspaceMember.lastName,
      department: workspaceMember.department,
      role: workspaceMember.role,
      email: user.email,
      name: user.name,
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
      ...new Set(members.map((m) => m.department).filter((v): v is string => !!v)),
    ].sort(),
    locations: [...new Set(records.map((r) => r.fields.workLocation).filter(Boolean))].sort(),
    schedules: [...new Set(records.map((r) => r.fields.workSchedule).filter(Boolean))].sort(),
    managers: members
      .filter((m) => m.role !== 'employee')
      .map((m) => ({
        id: m.id,
        name: [m.firstName, m.lastName].filter(Boolean).join(' ') || m.name,
        email: m.email,
      })),
    allowManager: a.admin && a.company.managersEnabled,
  }
}
function employeePhoto(data: string) {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(data)
  if (data && !match) throw new AppError(400, 'Choose a PNG or JPG image.')
  const bytes = Uint8Array.from(atob(match?.[2] || ''), (c) => c.charCodeAt(0))
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (data && (bytes.length < 16 || bytes.length > 250000 || !(match?.[1] === 'png' ? png : jpg)))
    throw new AppError(400, 'Choose a supported image smaller than 250 KB after resizing.')
  return { bytes, format: match?.[1] || 'png' }
}
