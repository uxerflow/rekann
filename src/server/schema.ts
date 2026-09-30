import { sql } from 'drizzle-orm'
import type { PolicyRules, PolicyRevision } from '../shared/leaves'
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

export const user = pgTable('auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  welcomeSeenAt: timestamp('welcome_seen_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
export const session = pgTable(
  'auth_session',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_idx').on(t.userId)],
)
export const account = pgTable(
  'auth_account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('account_user_idx').on(t.userId),
    uniqueIndex('account_provider_unique').on(t.providerId, t.accountId),
  ],
)
export const verification = pgTable(
  'auth_verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)
export const rateLimit = pgTable('auth_rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
})

export type Role = 'admin' | 'manager' | 'employee'
export type ManagerPermission = 'invite_employees' | 'manage_employees'
export const workspace = pgTable('workspace', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  country: text('country').notNull(),
  industry: text('industry').notNull(),
  timeZone: text('time_zone').notNull(),
  logoKey: text('logo_key'),
  managersEnabled: boolean('managers_enabled').notNull().default(false),
  managerPermissions: jsonb('manager_permissions')
    .$type<ManagerPermission[]>()
    .notNull()
    .default([]),
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
export const workspaceMember = pgTable(
  'workspace_member',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    role: text('role').$type<Role>().notNull().default('employee'),
    status: text('status').$type<'active' | 'removed'>().notNull().default('active'),
    firstName: text('first_name').notNull().default(''),
    lastName: text('last_name').notNull().default(''),
    jobTitle: text('job_title').notNull().default(''),
    employeeNumber: text('employee_number'),
    department: text('department'),
    employmentType: text('employment_type').$type<
      'Full-time' | 'Part-time' | 'Contract' | 'Internship' | 'Freelance'
    >(),
    startDate: date('start_date', { mode: 'string' }),
    phone: text('phone').notNull().default(''),
    birthDate: text('birth_date'),
    birthPlace: text('birth_place').notNull().default(''),
    avatarKey: text('avatar_key'),
    profileCompleted: boolean('profile_completed').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('workspace_user_unique').on(t.workspaceId, t.userId),
    index('membership_user_idx').on(t.userId),
    uniqueIndex('employee_number_workspace_unique').on(t.workspaceId, t.employeeNumber),
    check(
      'employment_type_check',
      sql`${t.employmentType} in ('Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance')`,
    ),
    check('membership_role_check', sql`${t.role} in ('admin', 'manager', 'employee')`),
    check('membership_status_check', sql`${t.status} in ('active', 'removed')`),
  ],
)
export const invitation = pgTable(
  'workspace_invitation',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').$type<Role>().notNull().default('employee'),
    tokenHash: text('token_hash').notNull().unique(),
    status: text('status').$type<'pending' | 'accepted' | 'revoked'>().notNull().default('pending'),
    delivery: text('delivery').$type<'pending' | 'sent' | 'failed'>().notNull().default('pending'),
    invitedBy: text('invited_by')
      .notNull()
      .references(() => user.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('invitation_workspace_idx').on(t.workspaceId),
    uniqueIndex('pending_invitation_unique')
      .on(t.workspaceId, t.email)
      .where(sql`${t.status} = 'pending'`),
    check('invitation_role_check', sql`${t.role} in ('admin', 'manager', 'employee')`),
  ],
)
export const auditEvent = pgTable(
  'audit_event',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id),
    action: text('action').notNull(),
    targetId: text('target_id'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_workspace_idx').on(t.workspaceId, t.createdAt)],
)

// Public marketing consent is separate from application users and workspace membership.
export const waitlistSubscriber = pgTable(
  'waitlist_subscriber',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    status: text('status')
      .$type<'subscribed' | 'unsubscribed' | 'suppressed'>()
      .notNull()
      .default('subscribed'),
    consentVersion: text('consent_version').notNull().default('waitlist-2026-09'),
    createdAt: createdAt(),
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
    syncPending: boolean('sync_pending').notNull().default(true),
    syncAttempts: integer('sync_attempts').notNull().default(0),
    nextSyncAt: timestamp('next_sync_at', { withTimezone: true }).notNull().defaultNow(),
    syncedAt: timestamp('synced_at', { withTimezone: true }),
    welcomeSentAt: timestamp('welcome_sent_at', { withTimezone: true }),
  },
  (t) => [
    index('waitlist_pending_idx')
      .on(t.nextSyncAt)
      .where(sql`${t.syncPending} = true`),
    check(
      'waitlist_status_check',
      sql`${t.status} in ('subscribed', 'unsubscribed', 'suppressed')`,
    ),
    check('waitlist_email_normalized', sql`${t.email} = lower(trim(${t.email}))`),
  ],
)

// Pre-account employment records are private to authorized people administrators.
// Membership remains the authentication boundary; a draft never grants access.
export const employeeRecord = pgTable(
  'employee_record',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    memberId: text('member_id').references(() => workspaceMember.id, { onDelete: 'set null' }),
    invitationId: text('invitation_id').references(() => invitation.id, { onDelete: 'set null' }),
    email: text('email').notNull(),
    employeeNumber: text('employee_number').notNull(),
    status: text('status').$type<'draft' | 'ready'>().notNull(),
    fields: jsonb('fields').$type<import('../shared/employee-input').EmployeeFields>().notNull(),
    avatarKey: text('avatar_key'),
    inactiveAt: timestamp('inactive_at', { withTimezone: true }),
    additionalContact: jsonb('additional_contact').$type<{
      name: string
      phone: string
      relationship: string
    }>(),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('employee_record_workspace_email_unique').on(t.workspaceId, t.email),
    uniqueIndex('employee_record_workspace_number_unique').on(t.workspaceId, t.employeeNumber),
    uniqueIndex('employee_record_member_unique').on(t.memberId),
    check('employee_record_status_check', sql`${t.status} in ('draft', 'ready')`),
  ],
)

export const employeeAttendance = pgTable(
  'employee_attendance',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => workspaceMember.id),
    clockIn: timestamp('clock_in', { withTimezone: true }).notNull(),
    clockOut: timestamp('clock_out', { withTimezone: true }),
    late: boolean('late').notNull().default(false),
  },
  (t) => [
    index('attendance_member_idx').on(t.workspaceId, t.memberId, t.clockIn),
    uniqueIndex('attendance_open_unique')
      .on(t.memberId)
      .where(sql`${t.clockOut} is null`),
    check('attendance_duration_check', sql`${t.clockOut} is null or ${t.clockOut} >= ${t.clockIn}`),
  ],
)
export const employeeAllowance = pgTable(
  'employee_allowance',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => workspaceMember.id),
    year: integer('year').notNull(),
    type: text('type').notNull(),
    halfDays: integer('half_days').notNull(),
  },
  (t) => [
    uniqueIndex('allowance_member_year_type').on(t.workspaceId, t.memberId, t.year, t.type),
    check('allowance_positive', sql`${t.halfDays} >= 0`),
  ],
)
export const employeeLeave = pgTable(
  'employee_leave',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => workspaceMember.id),
    type: text('type').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    halfDays: integer('half_days').notNull(),
    duration: text('duration').notNull(),
    reason: text('reason').notNull().default(''),
    status: text('status').$type<'pending' | 'approved' | 'rejected' | 'cancelled'>().notNull(),
    rejectionReason: text('rejection_reason'),
    reviewedBy: text('reviewed_by').references(() => user.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    attachmentId: text('attachment_id'),
    policyId: text('policy_id'),
    policyRules: jsonb('policy_rules').$type<PolicyRules>(),
  },
  (t) => [
    index('leave_member_idx').on(t.workspaceId, t.memberId),
    check('leave_dates_check', sql`${t.endDate} >= ${t.startDate}`),
    check('leave_days_check', sql`${t.halfDays}>0`),
    check('leave_status_check', sql`${t.status} in ('pending','approved','rejected','cancelled')`),
  ],
)
export const leavePolicy = pgTable(
  'leave_policy',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<'annual' | 'custom' | 'closure'>().notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    description: text('description').notNull().default(''),
    active: boolean('active').notNull().default(true),
    rules: jsonb('rules').$type<PolicyRules>().notNull(),
    revisions: jsonb('revisions').$type<PolicyRevision[]>().notNull(),
    coveredMemberIds: jsonb('covered_member_ids').$type<string[]>().notNull().default([]),
    version: integer('version').notNull().default(1),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('leave_policy_workspace_idx').on(t.workspaceId),
    uniqueIndex('leave_policy_name_unique').on(t.workspaceId, t.name),
    uniqueIndex('leave_policy_annual_unique')
      .on(t.workspaceId)
      .where(sql`${t.kind} = 'annual'`),
    check('leave_policy_kind_check', sql`${t.kind} in ('annual','custom','closure')`),
    check('leave_policy_version_check', sql`${t.version} > 0`),
  ],
)
export const employeeDocument = pgTable(
  'employee_document',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => workspaceMember.id),
    title: text('title').notNull(),
    category: text('category').notNull(),
    key: text('key'),
    url: text('url'),
    fileName: text('file_name'),
    mime: text('mime'),
    size: integer('size'),
    visibleToEmployee: boolean('visible_to_employee').notNull().default(false),
    version: integer('version').notNull().default(1),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: createdAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedBy: text('deleted_by').references(() => user.id),
  },
  (t) => [
    index('document_member_idx').on(t.workspaceId, t.memberId),
    check(
      'document_source_check',
      sql`(${t.key} is not null and ${t.url} is null) or (${t.key} is null and ${t.url} is not null)`,
    ),
  ],
)

// Keys never leave the server. Conversation access is scoped to the originating actor.
export const aiSettings = pgTable('ai_settings', {
  workspaceId: text('workspace_id')
    .primaryKey()
    .references(() => workspace.id, { onDelete: 'cascade' }),
  encryptedKey: text('encrypted_key'),
  funding: text('funding').$type<'workspace' | 'rekann'>().notNull().default('workspace'),
  enabled: boolean('enabled').notNull().default(false),
  allowedRoles: jsonb('allowed_roles').$type<Role[]>().notNull().default(['admin']),
  allowWrites: boolean('allow_writes').notNull().default(false),
  monthlyTokens: integer('monthly_tokens').notNull().default(100000),
  dailyRequests: integer('daily_requests').notNull().default(30),
  version: integer('version').notNull().default(1),
})
export const aiTurn = pgTable(
  'ai_turn',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    prompt: text('prompt').notNull(),
    status: text('status').notNull().default('pending'),
    result: jsonb('result').$type<import('../shared/ai').AiResult>(),
    proposal: jsonb('proposal').$type<{
      kind: 'create' | 'update'
      targetId: string
      targetVersion: number
      snapshot: string
      fields: Partial<Record<import('../shared/ai').AiField, string>>
    }>(),
    settingsVersion: integer('settings_version').notNull(),
    funding: text('funding').$type<'workspace' | 'rekann'>().notNull().default('workspace'),
    version: integer('version').notNull().default(0),
    tokens: integer('tokens').notNull().default(16384),
    createdAt: createdAt(),
  },
  (t) => [
    index('ai_turn_usage_idx').on(t.workspaceId, t.createdAt),
    index('ai_turn_retention_idx').on(t.createdAt),
    index('ai_turn_actor_idx').on(t.workspaceId, t.actorId, t.createdAt),
  ],
)

export const aiMemory = pgTable(
  'ai_memory',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull().default(true),
    notes: text('notes').notNull().default(''),
    version: integer('version').notNull().default(1),
  },
  (t) => [uniqueIndex('ai_memory_owner_idx').on(t.workspaceId, t.actorId)],
)

// Aggregate funded usage survives conversation/workspace deletion. No prompt or employee data.
export const aiBudget = pgTable(
  'ai_budget',
  {
    id: text('id').primaryKey(),
    period: text('period').notNull(),
    tokens: integer('tokens').notNull().default(0),
    requests: integer('requests').notNull().default(0),
  },
  (t) => [index('ai_budget_retention_idx').on(t.period)],
)
