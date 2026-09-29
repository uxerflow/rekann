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
  return id
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

test('employee detail works end to end with real scoped data and responsive dialogs', async ({
  page,
}) => {
  const ctx = await client()
  await testIdentity(ctx, uniqueEmail('detail-admin'))
  const workspaceId = await company(ctx, 'Employee Detail Test')
  testWorkspaces.push(workspaceId)
  await profile(ctx, workspaceId, 'Alex')
  const data = await details(ctx, workspaceId)
  const employeeCtx = await client()
  const email = uniqueEmail('detail-employee')
  const userId = await testIdentity(employeeCtx, email)
  const memberId = crypto.randomUUID()
  await db.insert(schema.workspaceMember).values({
    id: memberId,
    workspaceId,
    userId,
    firstName: 'Emily',
    lastName: 'Louris',
    jobTitle: 'UX/UI Designer',
    department: 'Design',
    employeeNumber: 'UX1002',
    employmentType: 'Full-time',
    startDate: '2026-01-01',
    profileCompleted: true,
  })
  await page.context().addCookies((await ctx.storageState()).cookies)
  await page.setViewportSize({ width: 1440, height: 1024 })
  const base = `/w/${data.workspace.slug}/team`
  await page.goto(base)
  await page.getByRole('link', { name: 'Emily Louris', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Work information' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Emily Louris', exact: true })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  mkdirSync('test-results/screens', { recursive: true })
  await page.screenshot({
    path: 'test-results/screens/detail-basic.png',
    fullPage: true,
    animations: 'disabled',
  })
  expect(await page.locator('.employee-personal-card').boundingBox()).toMatchObject({
    x: 260,
    width: 324,
  })
  expect(await page.locator('.employee-record-content').boundingBox()).toMatchObject({
    x: 624,
    width: 776,
  })
  await page.getByRole('button', { name: 'Edit work information', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Edit work information' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Job title', exact: true }).fill('Product Designer')
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await expect(page.getByRole('heading', { name: 'Discard your changes?' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep editing' }).click()
  await page.getByRole('combobox', { name: /^Employment type/ }).click()
  await page.getByRole('option', { name: 'Contract', exact: true }).click()
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.employee-work-cards')).toContainText('Product Designer')
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Edit profile', exact: true })
    .locator('input[type=file]')
    .setInputFiles('public/favicon-32.png')
  await expect(page.getByRole('button', { name: 'Clear selected image' })).toBeVisible()
  await page.screenshot({
    path: 'test-results/screens/detail-profile-edit.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Edit profile', exact: true })).toHaveCount(0)
  await expect(page.locator('.detail-avatar-button img')).toBeVisible()
  await page.getByRole('button', { name: 'Edit emergency contact', exact: true }).click()
  await page.getByRole('textbox', { name: 'Full name', exact: true }).fill('Albert Johnson')
  await page.getByRole('button', { name: 'Add new contact' }).click()
  await page.getByRole('textbox', { name: 'Full name', exact: true }).nth(1).fill('Jonathan Lue')
  await page.screenshot({
    path: 'test-results/screens/detail-emergency.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.locator('.employee-details-section')).toContainText('Jonathan Lue')
  await page
    .getByLabel('Employee information')
    .getByRole('button', { name: 'Attendance', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: 'No attendance records yet' })).toBeVisible()
  await page
    .getByLabel('Employee information')
    .getByRole('button', { name: 'Leaves', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: 'No time off recorded' })).toBeVisible()
  await page.getByRole('button', { name: 'Set allowance' }).click()
  await page.getByLabel('Annual allowance (days)').fill('12')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Record time off', exact: true }).click()
  await page.getByLabel('Start date').fill('2026-09-28')
  await page.getByLabel('End date').fill('2026-09-29')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Record time off', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.detail-table')).toContainText('approved')
  await page.getByRole('button', { name: 'View Annual leave on 2026-09-28' }).click()
  await page.screenshot({
    path: 'test-results/screens/detail-leave.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'Cancel leave', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel leave', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.detail-table')).toContainText('cancelled')
  await page
    .getByLabel('Employee information')
    .getByRole('button', { name: 'Documents', exact: true })
    .click()
  await page.getByRole('button', { name: 'Upload document', exact: true }).first().click()
  await page.getByLabel('Title', { exact: true }).fill('Employee agreement')
  await page.getByLabel('Choose document', { exact: true }).setInputFiles({
    name: 'agreement.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\nTest fixture document\n%%EOF'),
  })
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Upload document', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.detail-table')).toContainText('Employee agreement')
  await page.screenshot({
    path: 'test-results/screens/detail-documents.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'Actions for Employee agreement' }).click()
  await page.getByRole('button', { name: 'Manage document', exact: true }).click()
  await page.getByLabel('Title', { exact: true }).fill('Updated agreement')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.locator('.detail-table')).toContainText('Updated agreement')
  await page.getByRole('button', { name: 'Actions for Updated agreement' }).click()
  await page.getByRole('button', { name: 'Delete document', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete document', exact: true })
    .click()
  await expect(page.getByRole('button', { name: 'Updated agreement', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Updated agreement', exact: true })).toBeVisible()
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: 'Upload document', exact: true }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: 'Close dialog' }).click()
  }
  await page.setViewportSize({ width: 1440, height: 1024 })
  await page.getByRole('button', { name: 'Employee actions', exact: true }).click()
  await page.getByRole('button', { name: 'Deactivate employee', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Deactivate employee', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: 'This employee is inactive.' })).toBeVisible()
  await page.getByRole('button', { name: 'Reactivate employee', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Reactivate employee', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: 'Workspace access is not active' })).toBeVisible()
  await page.goto(base)
  await page.getByLabel('Show inactive').check()
  await expect(page.getByRole('link', { name: 'Emily Louris', exact: true })).toBeVisible()
  await ctx.dispose()
  await employeeCtx.dispose()
})
