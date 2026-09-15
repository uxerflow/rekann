import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
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
