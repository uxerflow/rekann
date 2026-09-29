import { test, expect } from '@playwright/test'
import { client, uniqueEmail, company, profile, details, password } from './helpers'
import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import { hashPassword } from 'better-auth/crypto'
import { eq, inArray } from 'drizzle-orm'
import * as schema from '../src/server/schema'
import { mkdirSync } from 'node:fs'
import type { DirectoryEmployee } from '../src/server/directory'

const names = [
  'Barly Vallendito',
  'Emily Louris',
  'David Tedjokumoro',
  'Laura Soekotjo',
  'Hera Lijanto',
  'Jacob Soenarto',
  'Aaron Tenggara',
  'Jonah Kartawiharja',
  'Amanda Soerjo',
  'Sarah Loekito',
  'Esther Anggawarsito',
  'Marie Tantomo',
  'Noah Tandiono',
  'Jonah Kartawiharja',
  'Sarah Loekito',
]
const departments = [
  'Lead',
  'Design',
  'Management',
  'Design',
  'Design',
  'Design',
  'Development',
  'Management',
  'Management',
  'Development',
  'Design',
  'Development',
  'Design',
  'Management',
  'Development',
]
const jobs = [
  'Creative Director',
  'UX/UI Designer',
  'Project Manager',
  'Graphic Design',
  'UX/UI Designer',
  'Graphic Design',
  'No-Code Developer',
  'Project Manager',
  'Asst. Project Manager',
  'No-Code Developer',
  'UX/UI Designer',
  'No-Code Developer',
  'Graphic Design',
  'Project Manager',
  'No-Code Developer',
]
const people: DirectoryEmployee[] = Array.from({ length: 75 }, (_, i) => ({
  id: 'fixture-' + i,
  firstName: names[i % 15].split(' ')[0],
  lastName: names[i % 15].split(' ').slice(1).join(' '),
  email: names[i % 15].toLowerCase().replaceAll(' ', '.') + '@uxer.digital',
  avatarKey: null,
  jobTitle: jobs[i % 15],
  role: i === 0 ? 'admin' : i % 15 === 2 || i % 15 === 7 ? 'manager' : 'employee',
  employeeNumber: 'UX' + (1001 + i),
  department: departments[i % 15],
  employmentType:
    i % 15 === 8 || i % 15 === 11
      ? 'Internship'
      : i % 15 === 9 || i % 15 === 12
        ? 'Freelance'
        : 'Full-time',
  startDate: '2026-01-01',
}))

// Test-owned identities only; no email delivery or bypass in application code.
process.loadEnvFile('.dev.vars')
if (process.env.APP_ENV !== 'local' || process.env.BETTER_AUTH_URL !== 'http://127.0.0.1:4310')
  throw new Error('Directory browser tests require local development')
neonConfig.webSocketConstructor = ws
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle(pool)
const testUsers: string[] = []
const testWorkspaces: string[] = []
async function testIdentity(ctx: Awaited<ReturnType<typeof client>>, email: string) {
  const id = crypto.randomUUID()
  testUsers.push(id)
  await db.insert(schema.user).values({ id, name: 'Test Person', email, emailVerified: true })
  await db.insert(schema.account).values({
    id: crypto.randomUUID(),
    userId: id,
    accountId: id,
    providerId: 'credential',
    password: await hashPassword(password),
  })
  const response = await ctx.post('/api/auth/sign-in/email', { data: { email, password } })
  expect(response.status()).toBe(200)
}
test.afterAll(async () => {
  for (const id of testWorkspaces)
    await db.delete(schema.workspace).where(eq(schema.workspace.id, id))
  if (testUsers.length) {
    await db.delete(schema.session).where(inArray(schema.session.userId, testUsers))
    await db.delete(schema.account).where(inArray(schema.account.userId, testUsers))
    await db.delete(schema.user).where(inArray(schema.user.id, testUsers))
  }
  await pool.end()
})

test('directory has scoped real data, Figma geometry, working controls and all recovery states', async ({
  page,
}) => {
  const ctx = await client()
  const email = uniqueEmail('directory')
  await testIdentity(ctx, email)
  const id = await company(ctx, 'Uxer Digital')
  testWorkspaces.push(id)
  await profile(ctx, id, 'Barly')
  const data = await details(ctx, id)
  await page.context().addCookies((await ctx.storageState()).cookies)
  const actual = await ctx.get('/api/app/directory?workspaceId=' + id)
  expect(actual.status()).toBe(200)
  const actualRows = await actual.json()
  expect(actualRows).toHaveLength(1)
  expect(actualRows[0]).toMatchObject({
    email,
    employeeNumber: null,
    department: null,
    startDate: null,
  })
  expect(actualRows[0]).not.toHaveProperty('birthDate')
  const foreign = await client()
  await testIdentity(foreign, uniqueEmail('directory-foreign'))
  expect((await foreign.get('/api/app/directory?workspaceId=' + id)).status()).toBe(403)
  await foreign.dispose()
  await page.setViewportSize({ width: 1440, height: 1152 })
  let state: 'filled' | 'empty' | 'error' | 'loading' | 'incomplete' = 'incomplete'
  let release: (() => void) | undefined
  await page.route('**/api/app/directory?*', async (route) => {
    if (state === 'loading')
      await new Promise<void>((resolve) => {
        release = resolve
      })
    await route.fulfill({
      status: state === 'error' ? 503 : 200,
      json:
        state === 'empty'
          ? []
          : state === 'error'
            ? { error: 'Unavailable' }
            : state === 'incomplete'
              ? actualRows
              : people,
    })
  })
  const url = '/w/' + data.workspace.slug + '/team'
  await page.goto(url)
  const table = page.getByRole('table')
  await expect(table.getByRole('row')).toHaveCount(2)
  await expect(table.locator('tbody')).not.toContainText('—')
  await expect(table.locator('.directory-id')).toHaveText('Not assigned')
  await expect(table.locator('.directory-badge-unset')).toHaveText('Not set')
  await expect(table.locator('tbody td').nth(5)).toHaveText('Not set')
  await expect(table.locator('tbody td').nth(2).locator('.directory-secondary')).toHaveCount(0)
  await expect(page.locator('.directory-pagination p')).toHaveText('Viewing 1 to 1 of 1 employee')
  state = 'filled'
  await page.reload()
  await expect(table.getByRole('row')).toHaveCount(16)
  await page.evaluate(() => document.fonts.ready)
  expect(await page.locator('.directory-toolbar').boundingBox()).toMatchObject({
    x: 240,
    y: 48,
    width: 1200,
    height: 56,
  })
  expect(await page.locator('.directory-filters').boundingBox()).toMatchObject({
    x: 240,
    y: 104,
    width: 1200,
    height: 56,
  })
  expect(await page.locator('.directory-search').boundingBox()).toMatchObject({
    x: 1060,
    y: 116,
    width: 360,
    height: 32,
  })
  expect((await table.getByRole('row').nth(1).boundingBox())!.height).toBe(60)
  expect((await table.locator('th').first().boundingBox())!.height).toBe(44)
  mkdirSync('test-results/screens', { recursive: true })
  await page.screenshot({ path: 'test-results/screens/team-list.png', fullPage: true })
  await page.getByRole('button', { name: 'Next page', exact: true }).click()
  await expect(page.locator('.directory-pagination')).toContainText('16 to 30')
  await page.getByRole('textbox', { name: 'Search employees' }).fill('UX1002')
  await expect(table.getByRole('row')).toHaveCount(2)
  await expect(table).toContainText('Emily Louris')
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Grid View', exact: true }).click()
  await expect(page.locator('.directory-card')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Grid View', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await expect(page.locator('.directory-card')).toHaveCount(15)
  await page.setViewportSize({ width: 1440, height: 1256 })
  expect(await page.locator('.directory-card').first().boundingBox()).toMatchObject({
    x: 260,
    y: 188,
    width: 275,
    height: 232,
  })
  await page.screenshot({ path: 'test-results/screens/team-grid.png', fullPage: true })
  await page.getByRole('combobox', { name: /Department/ }).click()
  await page.getByRole('option', { name: 'Design', exact: true }).click()
  await page.getByRole('combobox', { name: /Employment type/ }).click()
  const popup = page.locator('.select-popup-compact').filter({
    has: page.getByRole('listbox', { name: 'Employment type', exact: true }),
  })
  await expect(popup).toHaveCSS('font-size', '14px')
  await expect(popup).toHaveCSS('padding', '8px')
  await expect(popup).toHaveCSS('width', '160px')
  const option = page.getByRole('option', { name: 'All types', exact: true })
  await expect(option).toHaveCSS('height', '36px')
  await expect(option).toHaveCSS('margin-right', '0px')
  await expect(option).toHaveCSS('box-shadow', 'none')
  await expect(page.locator('.select-popup-compact')).toHaveCount(1)
  await expect(popup).toHaveCSS('opacity', '1')
  await page.screenshot({ path: 'test-results/screens/team-type-menu.png' })
  await page.getByRole('option', { name: 'Internship', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'No employees found' })).toBeVisible()
  await page.getByRole('button', { name: 'Clear search and filters' }).click()
  await page.getByRole('combobox', { name: /Sort employees/ }).focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('combobox', { name: /Sort employees/ })).toBeFocused()
  await expect(page.locator('.directory-card h2').first()).toHaveText('Aaron Tenggara')
  const first = page.locator('.directory-card').first()
  await first.hover()
  await first.getByRole('button', { name: /Actions for/ }).click()
  await page.getByRole('button', { name: 'Pin Aaron Tenggara', exact: true }).click()
  await page.reload()
  await expect(page.locator('.directory-card h2').first()).toHaveText('Aaron Tenggara')
  await expect(page.getByRole('button', { name: 'Grid View', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('combobox', { name: /Items per page/ }).click()
  await page.getByRole('option', { name: '30', exact: true }).click()
  await expect(page.locator('.directory-card')).toHaveCount(30)
  for (const width of [1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.screenshot({ path: 'test-results/screens/team-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'List View', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true)
  await page.setViewportSize({ width: 1440, height: 1024 })
  state = 'empty'
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your team starts here' })).toBeVisible()
  await expect(page.locator('.directory-filters')).toBeHidden()
  await expect(page.locator('.directory-pagination')).toHaveCount(0)
  await expect(page.locator('.directory-state-art')).toHaveAttribute('src', '/team/empty.svg')
  await expect(
    page.locator('.directory-state').getByRole('button', { name: 'Add employee' }),
  ).toBeVisible()
  await page.screenshot({ path: 'test-results/screens/team-empty.png', fullPage: true })
  await page.getByRole('button', { name: 'Grid View', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your team starts here' })).toBeVisible()
  await expect(page.locator('.directory-card')).toHaveCount(0)
  await page.getByRole('button', { name: 'List View', exact: true }).click()
  state = 'error'
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Employees could not be loaded' })).toBeVisible()
  state = 'filled'
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(table.getByRole('row')).toHaveCount(16)
  state = 'loading'
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('status', { name: 'Loading employees' })).toBeVisible()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(page.locator('.directory-skeleton').first()).toHaveCSS('animation-name', 'none')
  state = 'filled'
  release?.()
  await expect(table.getByRole('row')).toHaveCount(16)
  expect(
    await page
      .locator('.team-directory img')
      .evaluateAll((nodes) =>
        nodes.every(
          (n) => (n as HTMLImageElement).complete && (n as HTMLImageElement).naturalWidth > 0,
        ),
      ),
  ).toBe(true)
  await ctx.dispose()
})
