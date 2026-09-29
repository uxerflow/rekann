import { test, expect } from '@playwright/test'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import * as schema from '../src/server/schema'
import type { Database } from '../src/server/db'
import { directoryEmployees, type DirectoryEmployee } from '../src/server/directory'
import { employmentDates, filterEmployees, pageNumbers } from '../src/features/team/directory-model'

const person = (id: string, extra: Partial<DirectoryEmployee> = {}): DirectoryEmployee => ({
  id,
  firstName: id,
  lastName: 'Carter',
  email: id + '@example.test',
  role: 'employee',
  jobTitle: '',
  avatarKey: null,
  department: null,
  employmentType: null,
  employeeNumber: null,
  startDate: null,
  ...extra,
})
const filters = { search: '', department: '', type: '', sort: 'Default order' as const }
test('combined filters, accent-insensitive search and pinning preserve real employee identity', () => {
  const people = [
    person('a', {
      firstName: 'Émilie',
      employeeNumber: 'UX1002',
      department: 'Design',
      employmentType: 'Full-time',
    }),
    person('b', { department: 'Design', employmentType: 'Freelance' }),
    person('c'),
  ]
  expect(
    filterEmployees(
      people,
      { ...filters, search: 'emilie', department: 'Design', type: 'Full-time' },
      [],
    ).map((p) => p.id),
  ).toEqual(['a'])
  expect(filterEmployees(people, { ...filters, search: 'UX1002' }, []).map((p) => p.id)).toEqual([
    'a',
  ])
  expect(
    filterEmployees(people, { ...filters, search: 'c@example.test' }, []).map((p) => p.id),
  ).toEqual(['c'])
  expect(filterEmployees(people, { ...filters, department: 'Finance' }, ['a'])).toEqual([])
  expect(filterEmployees(people, filters, ['c']).map((p) => p.id)).toEqual(['c', 'a', 'b'])
  expect(people.map((p) => p.id)).toEqual(['a', 'b', 'c'])
})
test('date ordering leaves missing dates last, dates do not invent employment tenure', () => {
  const people = [
    person('a'),
    person('b', { startDate: '2026-03-01' }),
    person('c', { startDate: '2026-01-01' }),
  ]
  expect(
    filterEmployees(people, { ...filters, sort: 'Newest start date' }, []).map((p) => p.id),
  ).toEqual(['b', 'c', 'a'])
  expect(
    filterEmployees(people, { ...filters, sort: 'Oldest start date' }, []).map((p) => p.id),
  ).toEqual(['c', 'b', 'a'])
  expect(employmentDates(null, '2026-09-26')).toEqual({ date: 'Not set', tenure: '' })
  expect(employmentDates('2026-10-01', '2026-09-26').tenure).toBe('Starts soon')
  expect(employmentDates('2026-01-01', '2026-09-26').tenure).toBe('8 months')
  expect(pageNumbers(1, 1)).toEqual([1])
  expect(pageNumbers(5, 10)).toEqual([1, 'gap', 4, 5, 6, 'gap', 10])
})
test('directory restricts workspace membership, excludes removed employees and private fields', async () => {
  const pg = new PGlite()
  try {
    for (const file of [
      '0000_thankful_groot',
      '0001_workspace_slug',
      '0003_require_workspace_slug',
      '0006_cuddly_stature',
      '0007_red_ser_duncan',
      '0009_open_junta',
    ])
      await pg.exec(readFileSync('drizzle/' + file + '.sql', 'utf8'))
    const db = drizzle(pg, { schema }) as unknown as Database
    await db.insert(schema.user).values(
      ['owner', 'coworker', 'outsider'].map((id) => ({
        id,
        name: id,
        email: id + '@example.test',
      })),
    )
    await db.insert(schema.workspace).values(
      ['one', 'two'].map((id) => ({
        id,
        slug: id,
        name: id,
        createdBy: 'owner',
        country: 'Indonesia',
        industry: 'Technology',
        timeZone: 'Asia/Jakarta',
      })),
    )
    await db.insert(schema.workspaceMember).values([
      {
        id: 'owner-one',
        userId: 'owner',
        workspaceId: 'one',
        role: 'admin',
        employeeNumber: 'EMP1',
        phone: 'private phone',
        birthDate: '1990-01-01',
      },
      { id: 'coworker-one', userId: 'coworker', workspaceId: 'one', status: 'removed' },
      { id: 'outsider-two', userId: 'outsider', workspaceId: 'two', employeeNumber: 'EMP1' },
    ])
    const rows = await directoryEmployees(db, 'owner', 'one')
    expect(rows.map((row) => row.id)).toEqual(['owner-one'])
    expect(rows[0]).not.toHaveProperty('phone')
    expect(rows[0]).not.toHaveProperty('birthDate')
    expect(rows[0]).not.toHaveProperty('userId')
    await expect(directoryEmployees(db, 'outsider', 'one')).rejects.toMatchObject({ status: 403 })
    await expect(directoryEmployees(db, 'coworker', 'one')).rejects.toMatchObject({ status: 403 })
    await expect(directoryEmployees(db, 'owner', '')).rejects.toMatchObject({ status: 400 })
    await db
      .update(schema.workspaceMember)
      .set({ status: 'removed' })
      .where(eq(schema.workspaceMember.id, 'owner-one'))
    await expect(directoryEmployees(db, 'owner', 'one')).rejects.toMatchObject({ status: 403 })
  } finally {
    await pg.close()
  }
})
