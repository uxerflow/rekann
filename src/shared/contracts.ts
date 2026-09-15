import { z } from 'zod'

export const roles = ['admin', 'manager', 'employee'] as const
export const managerPermissions = ['invite_employees', 'manage_employees'] as const
export const roleLabels = { admin: 'Admin', manager: 'Manager / HR', employee: 'Employee' }
export const permissionLabels = {
  invite_employees: 'Invite employees',
  manage_employees: 'Remove employee access',
}
const id = z.string().min(1).max(100)
const text = (max: number) => z.string().trim().max(max)
export const workspaceInput = z
  .object({
    name: text(100).min(2, 'Enter a company name with at least 2 characters.'),
    description: text(200).min(1, 'Enter a company description.'),
    country: text(80).min(1, 'Select a country.'),
    industry: text(80).min(1, 'Select an industry.'),
    timeZone: text(100).refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value })
        return true
      } catch {
        return false
      }
    }, 'Select a valid time zone.'),
  })
  .strict()
export const workspaceUpdateInput = workspaceInput.extend({ workspaceId: id })
export const profileInput = z
  .object({
    workspaceId: id,
    firstName: text(80).min(1, 'Enter your first name.'),
    lastName: text(80).min(1, 'Enter your last name.'),
    jobTitle: text(100).min(1, 'Enter your job title.'),
    phone: text(30).refine(
      (v) => !v || /^[+()\d\s.-]{5,30}$/.test(v),
      'Enter a valid phone number.',
    ),
    birthPlace: text(100),
    birthDate: z.string().refine((value) => {
      if (!value) return true
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
      const d = new Date(`${value}T00:00:00Z`)
      return (
        !isNaN(d.getTime()) &&
        d.toISOString().slice(0, 10) === value &&
        d <= new Date() &&
        d.getUTCFullYear() >= 1900
      )
    }, 'Enter a valid date of birth in the past.'),
  })
  .strict()
export const inviteInput = z
  .object({ workspaceId: id, email: z.email().toLowerCase().max(254), role: z.enum(roles) })
  .strict()
export const accessInput = z
  .object({
    workspaceId: id,
    managersEnabled: z.boolean(),
    managerPermissions: z.array(z.enum(managerPermissions)).max(2),
  })
  .strict()
export const employeeRoleInput = z
  .object({ workspaceId: id, employeeId: id, role: z.enum(roles) })
  .strict()
export const employeeRemoveInput = z.object({ workspaceId: id, employeeId: id }).strict()
export const revokeInviteInput = z.object({ workspaceId: id, invitationId: id }).strict()
export const acceptInviteInput = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
export const mediaInput = z
  .object({ workspaceId: id, kind: z.enum(['logo', 'avatar']), data: z.string().max(350_000) })
  .strict()

export type WorkspaceInput = z.infer<typeof workspaceInput>
export type ProfileInput = z.infer<typeof profileInput>
