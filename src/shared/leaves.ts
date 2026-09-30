import { z } from 'zod'

export const employmentOptions = [
  'Full-time',
  'Contract',
  'Part-time',
  'Internship',
  'Freelance',
] as const
export const categories = [
  'Parental leave',
  'Marriage leave',
  'Bereavement leave',
  'Religious leave',
  'Study leave',
  'Medical leave',
  'Personal leave',
  'Other',
] as const
export const closureReasons = [
  'National collective holiday',
  'Company closure',
  'Company event',
  'Operational closure',
  'Other',
] as const
const count = z.number().int().min(0).max(366)
export const policyRules = z
  .object({
    eligibleMonths: z.number().int().min(0).max(600).default(0),
    coverage: z.enum(['All employees', 'Set eligibility']).default('All employees'),
    employmentTypes: z.array(z.enum(employmentOptions)).max(5).default([]),
    departments: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
    gender: z.enum(['All genders', 'Female', 'Male']).default('All genders'),
    unlimited: z.boolean().default(false),
    days: z.number().min(0).max(365).multipleOf(0.5).default(12),
    countAs: z.enum(['Working days', 'Calendar days']).default('Working days'),
    period: z.enum(['Per month', 'Per quarter', 'Per year']).default('Per year'),
    reset: z.enum(['January 1', 'Employee join date']).default('January 1'),
    notice: count.default(0),
    maxRequests: count.default(0),
    requestPeriod: z.enum(['Per month', 'Per quarter']).default('Per month'),
    maxDuration: count.default(0),
    halfDay: z.boolean().default(false),
    maxOff: z.number().int().min(0).max(10000).default(0),
    limitWithin: z.enum(['Department', 'Company']).default('Department'),
    approval: z.boolean().default(true),
    approver: z.enum(['Department manager', 'Owner', 'HR Admin']).default('Department manager'),
    document: z.enum(['Not required', 'Optional', 'Required']).default('Not required'),
    payment: z.enum(['Fully Paid', 'Unpaid', 'Partial', 'Tiered Pay']).default('Fully Paid'),
    payRate: z.number().min(0).max(100).default(100),
    payPeriods: z
      .array(z.object({ from: count, to: count, rate: z.number().min(0).max(100) }))
      .max(12)
      .default([]),
    unused: z
      .enum(['Expire unused days', 'Carry forward', 'Pay out unused days'])
      .default('Expire unused days'),
    payout: z.number().int().min(0).max(1_000_000_000).default(0),
    payrollMonth: z.number().int().min(1).max(12).default(12),
    startDate: z.union([z.iso.date(), z.literal('')]).default(''),
    endDate: z.union([z.iso.date(), z.literal('')]).default(''),
    deductAnnual: z.boolean().default(false),
    attendance: z
      .enum(['Company holiday', 'Paid leave', 'Unpaid leave', 'Excused absence'])
      .default('Company holiday'),
    approvedRequests: z
      .enum(['Refund their balances', 'Keep existing requests'])
      .default('Refund their balances'),
    pendingRequests: z
      .enum(['Cancel automatically', 'Keep pending requests'])
      .default('Cancel automatically'),
    blockRequests: z.boolean().default(true),
  })
  .superRefine((r, ctx) => {
    if (
      r.payment === 'Tiered Pay' &&
      (!r.payPeriods.length ||
        r.payPeriods.some(
          (p, i) =>
            p.from < 1 ||
            p.to < p.from ||
            (i === 0 ? p.from !== 1 : p.from !== r.payPeriods[i - 1].to + 1),
        ))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Pay periods must start at day 1 and continue without gaps or overlaps.',
        path: ['payPeriods'],
      })
  })
export type PolicyRules = z.infer<typeof policyRules>
export const savePolicyInput = z
  .object({
    workspaceId: z.string().min(1).max(100),
    id: z.uuid(),
    version: z.number().int().nonnegative(),
    kind: z.enum(['annual', 'custom', 'closure']),
    name: z.string().trim().min(1, 'Enter a policy name.').max(60),
    category: z.string().trim().max(100),
    description: z.string().trim().max(2000).default(''),
    active: z.boolean(),
    rules: policyRules,
  })
  .superRefine((p, ctx) => {
    if (
      p.kind === 'closure' &&
      (!p.rules.startDate ||
        !p.rules.endDate ||
        p.rules.startDate > p.rules.endDate ||
        p.rules.startDate.slice(0, 4) !== p.rules.endDate.slice(0, 4))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Choose a valid closure date range within one year.',
        path: ['rules', 'endDate'],
      })
    if (p.kind !== 'annual' && p.name.toLowerCase() === 'annual leave')
      ctx.addIssue({
        code: 'custom',
        message: 'Annual leave is reserved for the annual policy. Choose another name.',
        path: ['name'],
      })
    if (p.kind !== 'closure' && !p.rules.unlimited && p.rules.days < 0.5)
      ctx.addIssue({
        code: 'custom',
        message: 'Enter an allowance of at least half a day.',
        path: ['rules', 'days'],
      })
    if (p.kind === 'custom' && !categories.includes(p.category as (typeof categories)[number]))
      ctx.addIssue({ code: 'custom', message: 'Choose a leave category.', path: ['category'] })
    if (
      p.kind === 'closure' &&
      !closureReasons.includes(p.category as (typeof closureReasons)[number])
    )
      ctx.addIssue({ code: 'custom', message: 'Choose a closure reason.', path: ['category'] })
    if (p.kind === 'annual' && !p.rules.employmentTypes.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Choose at least one employment type.',
        path: ['rules', 'employmentTypes'],
      })
  })
export type PolicyDraft = z.infer<typeof savePolicyInput>
export type PolicyRevision = { effectiveFrom: string; rules: PolicyRules }
export type LeavePerson = {
  id: string
  userId: string
  name: string
  jobTitle: string
  department: string
  employmentType: string
  startDate: string
  gender: string
  avatarKey: string | null
  active: boolean
}
export function defaultPolicy(kind: PolicyDraft['kind']): PolicyRules {
  return policyRules.parse(
    kind === 'annual'
      ? {
          eligibleMonths: 12,
          employmentTypes: ['Full-time', 'Contract'],
          notice: 7,
          maxRequests: 1,
          maxDuration: 3,
          maxOff: 1,
        }
      : {},
  )
}
export function dateDays(start: string, end: string, countAs = 'Working days') {
  const days: string[] = []
  // Bound date expansion even for malformed or hostile input.
  for (
    let t = Date.parse(start), last = Math.min(Date.parse(end), t + 366 * 86400000);
    t <= last;
    t += 86400000
  ) {
    const d = new Date(t)
    if (countAs === 'Calendar days' || ![0, 6].includes(d.getUTCDay()))
      days.push(d.toISOString().slice(0, 10))
  }
  return days
}
export const addDays = (date: string, days: number) =>
  new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10)
export function eligible(person: LeavePerson, rules: PolicyRules, date: string) {
  if (!person.active || (person.startDate && date < person.startDate)) return false
  if (rules.eligibleMonths) {
    if (!person.startDate) return false
    const start = new Date(person.startDate)
    const endDay = start.getUTCDate()
    start.setUTCDate(1)
    start.setUTCMonth(start.getUTCMonth() + rules.eligibleMonths)
    const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate()
    start.setUTCDate(Math.min(endDay, last))
    if (start.toISOString().slice(0, 10) > date) return false
  }
  return (
    (!rules.employmentTypes.length ||
      rules.employmentTypes.includes(
        person.employmentType as (typeof employmentOptions)[number],
      )) &&
    (rules.coverage === 'All employees' ||
      ((!rules.departments.length || rules.departments.includes(person.department)) &&
        (rules.gender === 'All genders' || rules.gender === person.gender)))
  )
}
export function periodBounds(
  date: string,
  rules: Pick<PolicyRules, 'period' | 'reset'>,
  joined = '',
) {
  const year = Number(date.slice(0, 4)),
    month = Number(date.slice(5, 7))
  let start = `${year}-01-01`,
    end = `${year}-12-31`
  if (rules.period === 'Per month' || rules.period === 'Per quarter') {
    const first = rules.period === 'Per month' ? month : Math.floor((month - 1) / 3) * 3 + 1
    start = `${year}-${String(first).padStart(2, '0')}-01`
    end = new Date(Date.UTC(year, first - 1 + (rules.period === 'Per month' ? 1 : 3), 0))
      .toISOString()
      .slice(0, 10)
  } else if (rules.reset === 'Employee join date' && joined) {
    const anniversary = (y: number) =>
      `${y}-${joined.slice(5) === '02-29' && new Date(Date.UTC(y, 1, 29)).getUTCMonth() !== 1 ? '02-28' : joined.slice(5)}`
    const first = date < anniversary(year) ? year - 1 : year
    start = anniversary(first)
    end = addDays(anniversary(first + 1), -1)
  }
  return { start, end }
}
export function rulesOn(revisions: PolicyRevision[], date: string) {
  return [...revisions].reverse().find((r) => r.effectiveFrom <= date)?.rules ?? null
}
