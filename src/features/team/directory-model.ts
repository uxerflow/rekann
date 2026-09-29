import type { DirectoryEmployee } from '../../server/directory'

export const employmentTypes = [
  'Full-time',
  'Part-time',
  'Contract',
  'Internship',
  'Freelance',
] as const
export const sortOptions = [
  'Default order',
  'Name A to Z',
  'Name Z to A',
  'Newest start date',
  'Oldest start date',
] as const
export type DirectorySort = (typeof sortOptions)[number]
export type DirectoryFilters = {
  search: string
  department: string
  type: string
  sort: DirectorySort
}
export const employeeName = (person: DirectoryEmployee) =>
  [person.firstName, person.lastName].filter(Boolean).join(' ') || person.email
const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

export function filterEmployees(
  people: DirectoryEmployee[],
  filters: DirectoryFilters,
  pinned: readonly string[],
) {
  const search = normalize(filters.search.trim())
  return people
    .filter(
      (person) =>
        (!search ||
          [employeeName(person), person.email, person.employeeNumber ?? ''].some((value) =>
            normalize(value).includes(search),
          )) &&
        (!filters.department || person.department === filters.department) &&
        (!filters.type || person.employmentType === filters.type),
    )
    .sort((a, b) => {
      const pin = Number(pinned.includes(b.id)) - Number(pinned.includes(a.id))
      if (pin) return pin
      if (filters.sort.startsWith('Name')) {
        return (
          collator.compare(employeeName(a), employeeName(b)) *
            (filters.sort === 'Name Z to A' ? -1 : 1) || collator.compare(a.id, b.id)
        )
      }
      if (filters.sort.includes('start date')) {
        if (!a.startDate || !b.startDate) return Number(!a.startDate) - Number(!b.startDate)
        return (
          a.startDate.localeCompare(b.startDate) *
            (filters.sort === 'Newest start date' ? -1 : 1) || collator.compare(a.id, b.id)
        )
      }
      return 0
    })
}
export function pageNumbers(current: number, total: number): (number | 'gap')[] {
  const pages = [...new Set([1, total, current - 1, current, current + 1])]
    .filter((n) => n > 0 && n <= total)
    .sort((a, b) => a - b)
  return pages.flatMap((page, i) => (i && page - pages[i - 1] > 1 ? ['gap', page] : [page])) as (
    | number
    | 'gap'
  )[]
}
export function employmentDates(start: string | null, today: string) {
  if (!start) return { date: 'Not set', tenure: '' }
  const date = new Date(start + 'T00:00:00Z')
  if (Number.isNaN(date.getTime())) return { date: 'Not set', tenure: '' }
  const [y, m, d] = today.split('-').map(Number)
  const [sy, sm, sd] = start.split('-').map(Number)
  const months = Math.max(0, (y - sy) * 12 + m - sm - Number(d < sd))
  return {
    date: new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date),
    tenure:
      start > today
        ? 'Starts soon'
        : months === 0
          ? 'Less than a month'
          : months < 12
            ? `${months} ${months === 1 ? 'month' : 'months'}`
            : `${Math.floor(months / 12)} ${months < 24 ? 'year' : 'years'}`,
  }
}
