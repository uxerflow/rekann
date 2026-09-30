import { z } from 'zod'
import { employeeFields } from './employee-input'

export const detailScope = z.object({
  workspaceId: z.string().min(1).max(100),
  id: z.string().min(1).max(100),
})
export const contact = z.object({
  name: z.string().trim().max(100),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+()\d\s.-]*$/),
  relationship: z.string().trim().max(60),
})
export const detailPatch = detailScope.extend({
  version: z.number().int().nonnegative(),
  section: z.enum(['profile', 'personal', 'work', 'identification', 'address', 'emergency']),
  fields: employeeFields.partial().omit({ role: true }),
  additionalContact: contact.optional(),
  photo: z.string().max(340_000).optional(),
})
export const sectionFields = {
  profile: ['fullName', 'email', 'phone'],
  personal: ['birthPlace', 'birthDate', 'nationality', 'gender', 'maritalStatus'],
  work: [
    'employeeNumber',
    'department',
    'jobTitle',
    'employmentType',
    'startDate',
    'reportingManagerId',
    'workLocation',
    'workSchedule',
  ],
  identification: ['nationalId', 'taxId', 'healthInsurance', 'socialInsurance', 'drivingLicense'],
  address: ['address', 'city', 'province', 'zipCode', 'country'],
  emergency: ['emergencyName', 'emergencyPhone', 'emergencyRelationship'],
} as const
export const leaveTypes = ['Annual leave', 'Sick leave', 'Personal leave', 'Unpaid leave'] as const
export const leaveInput = detailScope
  .extend({
    requestId: z.uuid(),
    type: z.string().trim().min(1).max(60),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    duration: z.enum(['Full day', 'Half day']),
    reason: z.string().trim().max(2000),
    attachmentId: z.uuid().optional(),
  })
  .refine(
    (v) => v.endDate >= v.startDate && v.startDate.slice(0, 4) === v.endDate.slice(0, 4),
    'Choose dates within the same year, with the end on or after the start.',
  )
  .refine(
    (v) => v.duration !== 'Half day' || v.startDate === v.endDate,
    'Half-day leave must start and end on the same date.',
  )
export function leaveDays(start: string, end: string, duration: string) {
  let days = 0
  for (let date = Date.parse(start), last = Date.parse(end); date <= last; date += 86400000) {
    const weekday = new Date(date).getUTCDay()
    if (weekday !== 0 && weekday !== 6) days++
  }
  return duration === 'Half day' ? days / 2 : days
}
export const documentCategories = [
  'Personal documents',
  'Employment agreements',
  'Payslips',
] as const
export const documentInput = detailScope.extend({
  documentId: z.uuid(),
  version: z.number().int().nonnegative(),
  title: z.string().trim().min(1, 'Enter a document title.').max(160),
  category: z.enum(documentCategories),
  visibleToEmployee: z.boolean(),
  url: z.string().max(2048).optional(),
})
export function safeDocumentUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}
export function dayInZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}
