import { test, expect } from '@playwright/test'
import { client, uniqueEmail, company, profile, details, password } from './helpers'
import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import { hashPassword } from 'better-auth/crypto'
import { eq, inArray } from 'drizzle-orm'
import * as schema from '../src/server/schema'
import { mkdirSync } from 'node:fs'
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

test('add employee keeps draft data, matches Figma form geometry and supports invitation later', async ({
  page,
}) => {
  const ctx = await client()
  await testIdentity(ctx, uniqueEmail('employee-owner'))
  const workspaceId = await company(ctx, 'Employee Flow Test')
  testWorkspaces.push(workspaceId)
  await profile(ctx, workspaceId, 'Alex')
  const data = await details(ctx, workspaceId)
  await page.context().addCookies((await ctx.storageState()).cookies)
  await page.setViewportSize({ width: 1440, height: 1024 })
  const base = '/w/' + data.workspace.slug + '/team'
  await page.goto(base)
  await page.getByRole('button', { name: 'Add employee', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Add employee', exact: true })).toBeVisible()
  const fullName = page.getByRole('textbox', { name: 'Full name', exact: false })
  await expect(fullName).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  mkdirSync('test-results/screens', { recursive: true })
  await page.screenshot({ path: 'test-results/screens/add-personal.png', fullPage: true })
  expect(await fullName.boundingBox()).toMatchObject({ x: 416, width: 608, height: 36 })
  expect((await page.locator('.add-employee-heading').boundingBox())!.y).toBe(150)
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1024 })
  await fullName.fill('Emily Louris')
  const email = uniqueEmail('employee-new')
  await page.getByRole('textbox', { name: 'Work email' }).fill(email)
  await page.getByRole('button', { name: 'Auto generate' }).click()
  await expect(page.getByRole('textbox', { name: 'Employee ID' })).toHaveValue('EMP1001')
  await page.getByRole('button', { name: 'Add employee', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Leave without saving?' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep editing' }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Employment & access' })).toBeVisible()
  await page.getByRole('button', { name: /^Department / }).click()
  await page.getByRole('combobox', { name: 'Search department' }).fill('Design')
  await page.getByRole('option', { name: 'Design', exact: true }).click()
  await page.getByRole('textbox', { name: 'Job title' }).fill('UX Designer')
  await page.getByRole('combobox', { name: /^Employment type / }).click()
  await page.getByRole('option', { name: 'Full-time', exact: true }).click()
  await page.getByLabel('Start date').fill('2026-09-01')
  await page.getByRole('combobox', { name: /^Reporting manager / }).click()
  await page.getByRole('option', { name: /Alex Carter/ }).click()
  await expect(page.getByRole('option', { name: 'None', exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/screens/add-employment.png', fullPage: true })
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(fullName).toHaveValue('Emily Louris')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Department / })).toContainText('Design')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Additional information' })).toBeVisible()
  await page.locator('summary').filter({ hasText: 'Identification' }).click()
  await page.getByRole('textbox', { name: 'National ID', exact: true }).fill('private-test-value')
  await page.locator('summary').filter({ hasText: 'Address information' }).click()
  await page.getByPlaceholder('Enter street address').fill('123 Test Street')
  await page.getByPlaceholder('Enter city').fill('Malang')
  await page.locator('summary').filter({ hasText: 'Emergency contact' }).click()
  await page.getByPlaceholder('Enter contact’s full name').fill('Test Contact')
  await page.screenshot({ path: 'test-results/screens/add-additional.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true)
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.screenshot({ path: 'test-results/screens/add-mobile.png', fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1024 })
  let failOnce = true
  await page.route('**/api/app/employee/save', async (route) => {
    if (failOnce) {
      failOnce = false
      await route.fulfill({
        status: 503,
        json: { error: 'Unable to save right now. Please try again.' },
      })
    } else await route.continue()
  })
  await page.getByRole('button', { name: 'Save as draft', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Unable to save right now')
  await expect(page.getByPlaceholder('Enter city')).toHaveValue('Malang')
  await page.getByRole('button', { name: 'Save as draft', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Employee draft' })).toBeVisible()
  const recordId = page.url().split('/').at(-1)!
  const record = await (
    await ctx.get(`/api/app/employee/record?workspaceId=${workspaceId}&id=${recordId}`)
  ).json()
  expect(record.status).toBe('draft')
  expect(record.invite).toBeNull()
  expect(record.fields).toMatchObject({
    department: 'Design',
    city: 'Malang',
    nationalId: 'private-test-value',
  })
  await page.screenshot({ path: 'test-results/screens/employee-draft.png', fullPage: true })
  await page.getByRole('link', { name: 'Continue draft' }).click()
  await expect(fullName).toHaveValue('Emily Louris')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('main').getByRole('button', { name: 'Add employee', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect
    .poll(async () => Math.round((await page.getByRole('dialog').boundingBox())!.x))
    .toBe(520)
  expect((await page.getByRole('dialog').boundingBox())!.y).toBeGreaterThan(300)
  expect(
    await page
      .locator('.employee-record-page img')
      .evaluateAll((nodes) =>
        nodes.every(
          (n) => (n as HTMLImageElement).complete && (n as HTMLImageElement).naturalWidth > 0,
        ),
      ),
  ).toBe(true)
  await page.screenshot({ path: 'test-results/screens/employee-invitation.png', fullPage: true })
  await page.getByRole('button', { name: 'Invite later', exact: true }).click()
  await page.getByRole('link', { name: 'Back to directory', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Emily Louris', exact: true })).toBeVisible()
  const rows = await (await ctx.get('/api/app/directory?workspaceId=' + workspaceId)).json()
  expect(rows.filter((r: { email: string }) => r.email === email)).toHaveLength(1)
  expect(rows.find((r: { email: string }) => r.email === email)).not.toHaveProperty('fields')
  const ready = await (
    await ctx.get(`/api/app/employee/record?workspaceId=${workspaceId}&id=${recordId}`)
  ).json()
  expect(ready.status).toBe('ready')
  expect(ready.invite).toBeNull()
  await page.getByRole('button', { name: 'Add employee', exact: true }).click()
  await page.getByRole('textbox', { name: 'Full name' }).fill('Unsaved person')
  await page.getByRole('banner').getByRole('button', { name: 'Add employee', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Leave without saving?' })
    .getByRole('button', { name: 'Leave', exact: true })
    .click()
  await expect(page).toHaveURL(new RegExp(base + '$'))
  await ctx.dispose()
})
