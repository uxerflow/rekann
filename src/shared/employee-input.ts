import { z } from 'zod'

const text = (max = 100) => z.string().trim().max(max)
const date = z
  .string()
  .refine(
    (v) =>
      !v ||
      (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
        !Number.isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v),
    'Enter a valid date.',
  )
const phone = text(30).refine(
  (v) => !v || /^[+()\d\s.-]{5,30}$/.test(v),
  'Enter a valid phone number.',
)
export const employeeFields = z
  .object({
    fullName: text(100).min(1, 'Enter the full name.'),
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    employeeNumber: text(40)
      .min(1, 'Enter an employee ID.')
      .regex(
        /^[\p{L}\p{N}._-]+$/u,
        'Use letters, numbers, dots, hyphens or underscores for the employee ID.',
      ),
    phone,
    department: text(),
    jobTitle: text(60),
    employmentType: z.enum(['', 'Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance']),
    startDate: date,
    reportingManagerId: text(),
    workLocation: text(),
    workSchedule: text(160),
    role: z.enum(['employee', 'manager']),
    birthPlace: text(),
    birthDate: date.refine(
      (v) => !v || (v >= '1900-01-01' && new Date(v) <= new Date()),
      'Enter a date of birth in the past.',
    ),
    nationality: text(80),
    gender: text(40),
    maritalStatus: text(40),
    nationalId: text(80),
    taxId: text(80),
    healthInsurance: text(),
    socialInsurance: text(),
    drivingLicense: text(80),
    address: text(300),
    city: text(),
    province: text(),
    zipCode: text(20),
    country: text(80),
    emergencyName: text(),
    emergencyPhone: phone,
    emergencyRelationship: text(60),
  })
  .strict()
export type EmployeeFields = z.infer<typeof employeeFields>
export const emptyEmployee: EmployeeFields = {
  fullName: '',
  email: '',
  employeeNumber: '',
  phone: '',
  department: '',
  jobTitle: '',
  employmentType: '',
  startDate: '',
  reportingManagerId: '',
  workLocation: '',
  workSchedule: '',
  role: 'employee',
  birthPlace: '',
  birthDate: '',
  nationality: '',
  gender: '',
  maritalStatus: '',
  nationalId: '',
  taxId: '',
  healthInsurance: '',
  socialInsurance: '',
  drivingLicense: '',
  address: '',
  city: '',
  province: '',
  zipCode: '',
  country: '',
  emergencyName: '',
  emergencyPhone: '',
  emergencyRelationship: '',
}
export const saveEmployeeInput = z
  .object({
    workspaceId: text().min(1),
    id: z.uuid(),
    version: z.number().int().min(0),
    status: z.enum(['draft', 'ready']),
    fields: employeeFields,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.status === 'ready' && !v.fields.startDate)
      ctx.addIssue({
        code: 'custom',
        path: ['fields', 'startDate'],
        message: 'Choose a start date.',
      })
  })
