import { and, eq, gt, sql } from 'drizzle-orm'
import type { Database, Transaction } from './db'
import type { Auth } from './auth'
import type { AppConfig } from './config'
import { auditEvent, invitation, rateLimit, user, workspace, workspaceMember } from './schema'
import type { ManagerPermission, Role } from './schema'
import { invitationEmail, sendEmail } from './email'
import * as inputs from '../shared/contracts'

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
type Db = Database | Transaction
type Identity = { id: string; email: string; name: string }
export async function identity(auth: Auth, headers: Headers): Promise<Identity> {
  const session = await auth.api.getSession({ headers })
  if (!session || !session.user.emailVerified) throw new AppError(401, 'Sign in to continue.')
  return { id: session.user.id, email: session.user.email, name: session.user.name }
}
export function canManage(
  role: Role,
  settings: { managersEnabled: boolean; managerPermissions: ManagerPermission[] },
  permission: ManagerPermission,
) {
  return (
    role === 'admin' ||
    (role === 'manager' &&
      settings.managersEnabled &&
      settings.managerPermissions.includes(permission))
  )
}
export async function authorize(db: Db, userId: string, workspaceId: string, lock = false) {
  // All workspace mutations lock the workspace first, then re-read membership.
  // This serializes role changes, removals, invitation acceptance, and last-admin checks.
  const query = db.select().from(workspace).where(eq(workspace.id, workspaceId))
  const [company] = await (lock ? query.for('update') : query)
  if (!company) throw new AppError(404, 'Workspace not found.')
  const [employee] = await db
    .select()
    .from(workspaceMember)
    .where(
      and(
        eq(workspaceMember.workspaceId, workspaceId),
        eq(workspaceMember.userId, userId),
        eq(workspaceMember.status, 'active'),
      ),
    )
  if (!employee) throw new AppError(403, 'You no longer have access to this workspace.')
  return { company, employee }
}
function admin(role: Role) {
  if (role !== 'admin') throw new AppError(403, 'Only an admin can change workspace access.')
}
async function audit(
  db: Db,
  workspaceId: string,
  actorId: string,
  action: string,
  targetId?: string,
) {
  await db
    .insert(auditEvent)
    .values({ id: crypto.randomUUID(), workspaceId, actorId, action, targetId })
}
export async function limitAction(db: Database, userId: string, action: string, max = 20) {
  const now = Date.now()
  const result = await db
    .insert(rateLimit)
    .values({ id: crypto.randomUUID(), key: `app:${action}:${userId}`, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case when ${rateLimit.lastRequest} < ${now - 60_000} then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: sql`case when ${rateLimit.lastRequest} < ${now - 60_000} then ${now} else ${rateLimit.lastRequest} end`,
      },
      setWhere: sql`${rateLimit.lastRequest} < ${now - 60_000} or ${rateLimit.count} < ${max}`,
    })
    .returning({ id: rateLimit.id })
  if (!result.length)
    throw new AppError(429, 'Too many requests. Please wait a minute and try again.')
}
export async function bootstrap(db: Database, viewer: Identity) {
  const workspaces = await db
    .select({
      id: workspace.id,
      name: workspace.name,
      role: workspaceMember.role,
      profileCompleted: workspaceMember.profileCompleted,
    })
    .from(workspaceMember)
    .innerJoin(workspace, eq(workspaceMember.workspaceId, workspace.id))
    .where(and(eq(workspaceMember.userId, viewer.id), eq(workspaceMember.status, 'active')))
    .orderBy(workspace.createdAt)
  return { user: viewer, workspaces }
}
export async function workspaceDetails(db: Database, viewer: Identity, workspaceId: string) {
  const { company, employee } = await authorize(db, viewer.id, workspaceId)
  const employees = await db
    .select({
      id: workspaceMember.id,
      userId: workspaceMember.userId,
      firstName: workspaceMember.firstName,
      lastName: workspaceMember.lastName,
      jobTitle: workspaceMember.jobTitle,
      role: workspaceMember.role,
      email: user.email,
      avatarKey: workspaceMember.avatarKey,
      profileCompleted: workspaceMember.profileCompleted,
    })
    .from(workspaceMember)
    .innerJoin(user, eq(user.id, workspaceMember.userId))
    .where(and(eq(workspaceMember.workspaceId, workspaceId), eq(workspaceMember.status, 'active')))
    .orderBy(workspaceMember.createdAt)
  const mayInvite = canManage(employee.role, company, 'invite_employees')
  const invitations = mayInvite
    ? await db
        .select({
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          delivery: invitation.delivery,
          expiresAt: invitation.expiresAt,
        })
        .from(invitation)
        .where(and(eq(invitation.workspaceId, workspaceId), eq(invitation.status, 'pending')))
        .orderBy(invitation.createdAt)
    : []
  return {
    workspace: company,
    employee,
    employees,
    invitations,
    permissions: {
      admin: employee.role === 'admin',
      invite: mayInvite,
      remove: canManage(employee.role, company, 'manage_employees'),
    },
  }
}
export async function createWorkspace(db: Database, viewer: Identity, raw: unknown) {
  const data = inputs.workspaceInput.parse(raw)
  return db.transaction(async (tx) => {
    // Serialize creation per identity so retries cannot create duplicate workspaces.
    await tx.select({ id: user.id }).from(user).where(eq(user.id, viewer.id)).for('update')
    const [existing] = await tx
      .select({ id: workspace.id })
      .from(workspace)
      .where(and(eq(workspace.createdBy, viewer.id), eq(workspace.name, data.name)))
    if (existing) return existing
    const id = crypto.randomUUID()
    await tx.insert(workspace).values({ id, ...data, createdBy: viewer.id })
    await tx
      .insert(workspaceMember)
      .values({ id: crypto.randomUUID(), workspaceId: id, userId: viewer.id, role: 'admin' })
    await audit(tx, id, viewer.id, 'workspace.created')
    return { id }
  })
}
export async function saveProfile(db: Database, viewer: Identity, raw: unknown) {
  const { workspaceId, ...data } = inputs.profileInput.parse(raw)
  return db.transaction(async (tx) => {
    const { employee } = await authorize(tx, viewer.id, workspaceId, true)
    await tx
      .update(workspaceMember)
      .set({
        ...data,
        birthDate: data.birthDate || null,
        profileCompleted: true,
        updatedAt: new Date(),
      })
      .where(eq(workspaceMember.id, employee.id))
    await tx
      .update(user)
      .set({
        name: [data.firstName, data.lastName].filter(Boolean).join(' '),
        updatedAt: new Date(),
      })
      .where(eq(user.id, viewer.id))
    await audit(tx, workspaceId, viewer.id, 'profile.updated', employee.id)
    return { ok: true }
  })
}
export async function tokenHash(token: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('')
}
export async function createInvitation(
  db: Database,
  config: AppConfig,
  viewer: Identity,
  raw: unknown,
) {
  const data = inputs.inviteInput.parse(raw)
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
  const hash = await tokenHash(token)
  const result = await db.transaction(async (tx) => {
    const { company, employee } = await authorize(tx, viewer.id, data.workspaceId, true)
    if (!canManage(employee.role, company, 'invite_employees'))
      throw new AppError(403, 'You do not have permission to invite employees.')
    if (employee.role !== 'admin' && data.role !== 'employee')
      throw new AppError(403, 'Managers can only invite employees.')
    if (data.role === 'manager' && !company.managersEnabled)
      throw new AppError(400, 'Enable the Manager / HR role first.')
    const [existing] = await tx
      .select({ id: workspaceMember.id })
      .from(workspaceMember)
      .innerJoin(user, eq(user.id, workspaceMember.userId))
      .where(
        and(
          eq(workspaceMember.workspaceId, data.workspaceId),
          eq(workspaceMember.status, 'active'),
          eq(user.email, data.email),
        ),
      )
    if (existing) throw new AppError(409, 'This person already has access to your workspace.')
    // Resend rotates the token and invalidates the previous invitation immediately.
    await tx
      .update(invitation)
      .set({ status: 'revoked' })
      .where(
        and(
          eq(invitation.workspaceId, data.workspaceId),
          eq(invitation.email, data.email),
          eq(invitation.status, 'pending'),
        ),
      )
    const id = crypto.randomUUID()
    await tx.insert(invitation).values({
      id,
      ...data,
      tokenHash: hash,
      invitedBy: viewer.id,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    })
    await audit(tx, data.workspaceId, viewer.id, 'invitation.created', id)
    return { id, name: company.name }
  })
  try {
    await sendEmail(
      config,
      invitationEmail(data.email, result.name, `${config.BETTER_AUTH_URL}/invite/${token}`),
    )
    await db.update(invitation).set({ delivery: 'sent' }).where(eq(invitation.id, result.id))
    return { ok: true }
  } catch {
    await db.update(invitation).set({ delivery: 'failed' }).where(eq(invitation.id, result.id))
    throw new AppError(
      502,
      'The invitation was saved, but the email could not be sent. Use Resend invitation to try again.',
    )
  }
}
export async function invitationDetails(db: Database, token: string) {
  inputs.acceptInviteInput.parse({ token })
  const [record] = await db
    .select({
      id: invitation.id,
      name: workspace.name,
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
    })
    .from(invitation)
    .innerJoin(workspace, eq(workspace.id, invitation.workspaceId))
    .where(eq(invitation.tokenHash, await tokenHash(token)))
  if (!record || record.status !== 'pending' || record.expiresAt < new Date())
    throw new AppError(
      410,
      'This invitation has expired or is no longer available. Ask your admin for a new invitation.',
    )
  const [local, domain] = record.email.split('@')
  return { name: record.name, emailHint: `${local.slice(0, 2)}***@${domain}` }
}
export async function acceptInvitation(db: Database, viewer: Identity, raw: unknown) {
  const { token } = inputs.acceptInviteInput.parse(raw)
  const hash = await tokenHash(token)
  return db.transaction(async (tx) => {
    const [record] = await tx.select().from(invitation).where(eq(invitation.tokenHash, hash))
    if (!record) throw new AppError(410, 'This invitation is no longer available.')
    const [company] = await tx
      .select()
      .from(workspace)
      .where(eq(workspace.id, record.workspaceId))
      .for('update')
    const [current] = await tx
      .select()
      .from(invitation)
      .where(eq(invitation.id, record.id))
      .for('update')
    if (current.email !== viewer.email.toLowerCase())
      throw new AppError(403, 'Sign in with the email address that received this invitation.')
    if (current.status === 'accepted') {
      const [existing] = await tx
        .select()
        .from(workspaceMember)
        .where(
          and(
            eq(workspaceMember.workspaceId, record.workspaceId),
            eq(workspaceMember.userId, viewer.id),
            eq(workspaceMember.status, 'active'),
          ),
        )
      if (existing)
        return { workspaceId: record.workspaceId, profileCompleted: existing.profileCompleted }
    }
    if (current.status !== 'pending' || current.expiresAt < new Date())
      throw new AppError(410, 'This invitation has expired or is no longer available.')
    const role = current.role === 'manager' && !company.managersEnabled ? 'employee' : current.role
    const [existing] = await tx
      .select()
      .from(workspaceMember)
      .where(
        and(
          eq(workspaceMember.workspaceId, record.workspaceId),
          eq(workspaceMember.userId, viewer.id),
        ),
      )
    if (!existing)
      await tx.insert(workspaceMember).values({
        id: crypto.randomUUID(),
        workspaceId: record.workspaceId,
        userId: viewer.id,
        role,
      })
    else if (existing.status === 'removed')
      await tx
        .update(workspaceMember)
        .set({ status: 'active', role, updatedAt: new Date() })
        .where(eq(workspaceMember.id, existing.id))
    await tx.update(invitation).set({ status: 'accepted' }).where(eq(invitation.id, record.id))
    await audit(tx, record.workspaceId, viewer.id, 'invitation.accepted', record.id)
    return {
      workspaceId: record.workspaceId,
      profileCompleted: existing?.profileCompleted ?? false,
    }
  })
}
export async function revokeInvitation(db: Database, viewer: Identity, raw: unknown) {
  const data = inputs.revokeInviteInput.parse(raw)
  return db.transaction(async (tx) => {
    const { company, employee } = await authorize(tx, viewer.id, data.workspaceId, true)
    if (!canManage(employee.role, company, 'invite_employees'))
      throw new AppError(403, 'You do not have permission to manage invitations.')
    const [invite] = await tx
      .select()
      .from(invitation)
      .where(
        and(eq(invitation.id, data.invitationId), eq(invitation.workspaceId, data.workspaceId)),
      )
    if (!invite) throw new AppError(404, 'Invitation not found.')
    if (employee.role !== 'admin' && invite.role !== 'employee')
      throw new AppError(403, 'Only an admin can manage this invitation.')
    await tx
      .update(invitation)
      .set({ status: 'revoked' })
      .where(and(eq(invitation.id, invite.id), eq(invitation.status, 'pending')))
    await audit(tx, data.workspaceId, viewer.id, 'invitation.revoked', invite.id)
    return { ok: true }
  })
}
export async function saveAccess(db: Database, viewer: Identity, raw: unknown) {
  const data = inputs.accessInput.parse(raw)
  return db.transaction(async (tx) => {
    const { employee } = await authorize(tx, viewer.id, data.workspaceId, true)
    admin(employee.role)
    await tx
      .update(workspace)
      .set({
        managersEnabled: data.managersEnabled,
        managerPermissions: [...new Set(data.managerPermissions)],
        updatedAt: new Date(),
      })
      .where(eq(workspace.id, data.workspaceId))
    if (!data.managersEnabled) {
      await tx
        .update(workspaceMember)
        .set({ role: 'employee', updatedAt: new Date() })
        .where(
          and(
            eq(workspaceMember.workspaceId, data.workspaceId),
            eq(workspaceMember.role, 'manager'),
          ),
        )
      await tx
        .update(invitation)
        .set({ role: 'employee' })
        .where(
          and(
            eq(invitation.workspaceId, data.workspaceId),
            eq(invitation.status, 'pending'),
            eq(invitation.role, 'manager'),
          ),
        )
    }
    await audit(tx, data.workspaceId, viewer.id, 'access.updated')
    return { ok: true }
  })
}
export async function changeEmployee(
  db: Database,
  viewer: Identity,
  raw: unknown,
  remove: boolean,
) {
  const data = remove ? inputs.employeeRemoveInput.parse(raw) : inputs.employeeRoleInput.parse(raw)
  const requestedRole = remove ? undefined : inputs.employeeRoleInput.parse(raw).role
  return db.transaction(async (tx) => {
    const { company, employee } = await authorize(tx, viewer.id, data.workspaceId, true)
    if (!remove) admin(employee.role)
    else if (!canManage(employee.role, company, 'manage_employees'))
      throw new AppError(403, 'You do not have permission to remove employee access.')
    const [target] = await tx
      .select()
      .from(workspaceMember)
      .where(
        and(
          eq(workspaceMember.id, data.employeeId),
          eq(workspaceMember.workspaceId, data.workspaceId),
          eq(workspaceMember.status, 'active'),
        ),
      )
    if (!target) throw new AppError(404, 'Employee not found.')
    if (employee.role !== 'admin' && target.role !== 'employee')
      throw new AppError(403, 'Only an admin can manage this person.')
    const nextRole = requestedRole ?? target.role
    if (nextRole === 'manager' && !company.managersEnabled)
      throw new AppError(400, 'Enable the Manager / HR role first.')
    if (target.role === 'admin' && (remove || nextRole !== 'admin')) {
      const admins = await tx
        .select({ id: workspaceMember.id })
        .from(workspaceMember)
        .where(
          and(
            eq(workspaceMember.workspaceId, data.workspaceId),
            eq(workspaceMember.role, 'admin'),
            eq(workspaceMember.status, 'active'),
          ),
        )
      if (admins.length <= 1)
        throw new AppError(409, 'Your workspace must have at least one admin.')
    }
    await tx
      .update(workspaceMember)
      .set({ role: nextRole, status: remove ? 'removed' : 'active', updatedAt: new Date() })
      .where(eq(workspaceMember.id, target.id))
    if (remove) {
      const [person] = await tx
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, target.userId))
      await tx
        .update(invitation)
        .set({ status: 'revoked' })
        .where(
          and(
            eq(invitation.workspaceId, data.workspaceId),
            eq(invitation.email, person.email),
            eq(invitation.status, 'pending'),
          ),
        )
    }
    await audit(
      tx,
      data.workspaceId,
      viewer.id,
      remove ? 'employee.removed' : 'employee.role_changed',
      target.id,
    )
    return { ok: true }
  })
}

export type Bootstrap = Awaited<ReturnType<typeof bootstrap>>
export type WorkspaceDetails = Awaited<ReturnType<typeof workspaceDetails>>
