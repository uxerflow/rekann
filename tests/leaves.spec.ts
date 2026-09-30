import { test, expect, type APIRequestContext } from '@playwright/test'
import { client, uniqueEmail, company, profile, details, password, post } from './helpers'
import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import { hashPassword } from 'better-auth/crypto'
import { eq, inArray } from 'drizzle-orm'
import * as schema from '../src/server/schema'
import { defaultPolicy } from '../src/shared/leaves'
import { mkdirSync } from 'node:fs'
process.loadEnvFile('.dev.vars')
if (
  process.env.APP_ENV !== 'local' ||
  process.env.BETTER_AUTH_URL !== 'http://127.0.0.1:4310' ||
  !new URL(process.env.DATABASE_URL!).hostname.startsWith('ep-nameless-wind-b33lseje')
)
  throw new Error('Leaves browser tests require the isolated development database.')
neonConfig.webSocketConstructor = ws
const pool = new Pool({ connectionString: process.env.DATABASE_URL }),
  db = drizzle(pool),
  users: string[] = [],
  workspaces: string[] = []
async function identity(ctx: APIRequestContext, label: string) {
  const id = crypto.randomUUID(),
    email = uniqueEmail(label)
  users.push(id)
  await db.insert(schema.user).values({ id, email, name: label, emailVerified: true })
  await db.insert(schema.account).values({
    id: crypto.randomUUID(),
    userId: id,
    accountId: id,
    providerId: 'credential',
    password: await hashPassword(password),
  })
  expect((await ctx.post('/api/auth/sign-in/email', { data: { email, password } })).status()).toBe(
    200,
  )
  return id
}
test.afterAll(async () => {
  for (const id of workspaces) await db.delete(schema.workspace).where(eq(schema.workspace.id, id))
  if (users.length) {
    await db.delete(schema.session).where(inArray(schema.session.userId, users))
    await db.delete(schema.account).where(inArray(schema.account.userId, users))
    await db.delete(schema.user).where(inArray(schema.user.id, users))
  }
  await pool.end()
})
test('admin leaves persist requests, policies, approvals and closures with accessible responsive interactions', async ({
  page,
}) => {
  test.setTimeout(240000)
  const ctx = await client()
  await identity(ctx, 'leaves-admin')
  const workspaceId = await company(ctx, 'Leaves Review')
  workspaces.push(workspaceId)
  await profile(ctx, workspaceId)
  const data = await details(ctx, workspaceId)
  const employee = await client(),
    employeeId = await identity(employee, 'leaves-employee'),
    memberId = crypto.randomUUID()
  await db.insert(schema.workspaceMember).values({
    id: memberId,
    workspaceId,
    userId: employeeId,
    firstName: 'Emily',
    lastName: 'Louris',
    jobTitle: 'UI/UX Designer',
    department: 'Design',
    employmentType: 'Full-time',
    startDate: '2020-01-01',
    profileCompleted: true,
  })
  for (const [i, name] of [
    'Laura Soekotjo',
    'Hera Lijanto',
    'Aaron Tenggara',
    'Sarah Loekito',
    'Jonah Kartawiharia',
  ].entries()) {
    const id = crypto.randomUUID()
    users.push(id)
    await db
      .insert(schema.user)
      .values({ id, email: uniqueEmail('calendar'), name, emailVerified: true })
    await db.insert(schema.workspaceMember).values({
      id: crypto.randomUUID(),
      workspaceId,
      userId: id,
      firstName: name.split(' ')[0],
      lastName: name.split(' ').slice(1).join(' '),
      jobTitle: i % 2 ? 'No-Code Developer' : 'Graphic Designer',
      department: i % 2 ? 'Development' : 'Design',
      employmentType: 'Full-time',
      startDate: '2020-01-01',
      profileCompleted: true,
    })
  }
  const annual = {
    workspaceId,
    id: crypto.randomUUID(),
    version: 0,
    kind: 'annual',
    name: 'Annual leave',
    category: '',
    description: '',
    active: true,
    rules: {
      ...defaultPolicy('annual'),
      eligibleMonths: 0,
      notice: 0,
      maxRequests: 0,
      maxDuration: 0,
      maxOff: 0,
    },
  }
  await post(ctx, 'leaves/policy', annual)
  const request = {
    workspaceId,
    id: memberId,
    requestId: crypto.randomUUID(),
    type: 'Annual leave',
    startDate: '2027-02-01',
    endDate: '2027-02-02',
    duration: 'Full day',
    reason: 'A short family break.',
  }
  await post(employee, 'employee/leave', request)
  expect((await employee.get(`/api/app/leaves?workspaceId=${workspaceId}`)).status()).toBe(403)
  await page.context().addCookies((await ctx.storageState()).cookies)
  await page.setViewportSize({ width: 1440, height: 1024 })
  let releaseLoad!: () => void
  const loadGate = new Promise<void>((resolve) => {
    releaseLoad = resolve
  })
  await page.route('**/api/app/leaves?*', async (route) => {
    await loadGate
    await route.fulfill({ status: 503, json: { error: 'Temporarily unavailable' } })
  })
  await page.goto(`/w/${data.workspace.slug}/leaves`)
  await expect(page.getByRole('status', { name: 'Loading leaves' })).toBeVisible()
  releaseLoad()
  await expect(page.getByRole('heading', { name: 'Could not load leaves' })).toBeVisible()
  await page.unroute('**/api/app/leaves?*')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Leaves sections' })).toBeVisible()
  await expect(page.locator('.leave-calendar-layout')).toBeVisible()
  await page.getByLabel('Calendar date').fill('2027-02-01')
  await page.evaluate(() => document.fonts.ready)
  mkdirSync('test-results/leaves', { recursive: true })
  const shot = async (name: string) => {
    await expect(page.locator('.select-popup')).toHaveCount(0)
    await page.screenshot({
      path: `test-results/leaves/${name}.png`,
      animations: 'disabled',
      fullPage: true,
    })
  }
  await shot('week')
  expect(await page.locator('.leave-tabs-bar').boundingBox()).toMatchObject({
    x: 240,
    y: 48,
    height: 56,
    width: 1200,
  })
  await page.getByRole('combobox', { name: /Calendar view/ }).click()
  await page.getByRole('option', { name: 'Month', exact: true }).click()
  await expect(page.locator('.leave-month')).toBeVisible()
  await shot('month')
  await page.getByRole('combobox', { name: /Calendar view/ }).click()
  await expect(page.locator('.select-option[aria-selected=true] svg')).toHaveAttribute(
    'stroke-width',
    '1.5',
  )
  await page.getByRole('option', { name: 'Year', exact: true }).hover()
  await expect(page.locator('.select-highlight')).toHaveCount(1)
  await page.getByRole('option', { name: 'Year', exact: true }).click()
  await expect(page.locator('.leave-mini-month')).toHaveCount(12)
  await shot('year')
  await page
    .getByRole('navigation', { name: 'Leaves sections' })
    .getByRole('button', { name: 'Request', exact: true })
    .click()
  await expect(page.locator('.leave-table')).toContainText('Emily Louris')
  await shot('requests')
  await page.getByRole('button', { name: 'View request by Emily Louris' }).click()
  await expect(page.getByRole('dialog', { name: 'Request details' })).toContainText(
    'A short family break.',
  )
  await shot('review')
  await page.getByRole('dialog').getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.leave-table')).toContainText('Approved')
  // Approval retry cannot double-charge. Two simultaneous calls are serialized by the workspace lock.
  const retry = await Promise.all([
    ctx.post('/api/app/employee/leave-review', { data: { ...request, action: 'approve' } }),
    ctx.post('/api/app/employee/leave-review', { data: { ...request, action: 'approve' } }),
  ])
  expect(retry.map((r) => r.status())).toEqual([200, 200])
  await page.getByRole('button', { name: 'Record time off', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Record time off', exact: true })
  await expect(dialog.getByRole('combobox', { name: /Leave type/ })).toBeDisabled()
  await shot('record-empty')
  await dialog.getByRole('button', { name: /^Employee/ }).click()
  await page.getByRole('combobox', { name: 'Search employee', exact: true }).fill('Emily')
  await page.getByRole('option', { name: 'Emily Louris', exact: true }).click()
  await dialog.getByLabel('Start date').fill('2027-02-08')
  await dialog.getByLabel('End date').fill('2027-02-09')
  await expect(dialog.getByRole('combobox', { name: /Leave type/ })).toBeEnabled()
  await dialog.getByRole('combobox', { name: /Leave type/ }).click()
  await page.getByRole('option', { name: 'Annual leave', exact: true }).click()
  await shot('record-ready')
  await page.route('**/api/app/employee/leave', (route) =>
    route.fulfill({ status: 503, json: { error: 'Could not record time off. Try again.' } }),
  )
  await dialog.getByRole('button', { name: 'Record time off', exact: true }).click()
  await expect(dialog).toContainText('Could not record time off. Try again.')
  await expect(dialog.getByLabel('Start date')).toHaveValue('2027-02-08')
  await page.unroute('**/api/app/employee/leave')
  await dialog.getByRole('button', { name: 'Record time off', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.leave-calendar-layout')).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Leaves sections' })
    .getByRole('button', { name: 'Request', exact: true })
    .click()
  await expect(page.locator('.leave-table tbody tr')).toHaveCount(2)
  await page.getByRole('searchbox', { name: 'Search requests' }).fill('missing employee')
  await expect(page.getByRole('heading', { name: 'No results found' })).toBeVisible()
  await shot('no-results')
  await page.getByRole('button', { name: 'Clear filters' }).click()
  const rejected = {
    ...request,
    requestId: crypto.randomUUID(),
    startDate: '2027-03-01',
    endDate: '2027-03-01',
  }
  await post(employee, 'employee/leave', rejected)
  await page.reload()
  await expect(page.locator('.leave-calendar-layout')).toBeVisible()
  await page
    .getByRole('navigation', { name: 'Leaves sections' })
    .getByRole('button', { name: 'Request', exact: true })
    .click()
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Reject', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Reason', exact: true })
    .fill('Please choose another day.')
  await page.getByRole('button', { name: 'Reject request', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.leave-table')).toContainText('Rejected')
  await page.getByRole('button', { name: 'Leave policy', exact: true }).click()
  await page.getByRole('button', { name: 'Configure', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Annual Leave', exact: true })).toBeVisible()
  await shot('annual-policy')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Add leave policy', exact: true }).click()
  await page.getByRole('button', { name: /Custom leave Leave requested/ }).click()
  await page.getByRole('textbox', { name: /^Leave name/ }).fill('Study leave')
  await page.getByRole('combobox', { name: /Category/ }).click()
  await page.getByRole('option', { name: 'Study leave', exact: true }).click()
  await page.getByRole('spinbutton', { name: 'Allowance', exact: true }).fill('3')
  await shot('custom-policy')
  await page.getByRole('button', { name: 'Create policy', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.locator('.leave-table')).toContainText('Study leave')
  await page.getByRole('button', { name: 'Add leave policy', exact: true }).click()
  await page.getByRole('button', { name: /Mass leave Time off scheduled/ }).click()
  await page.getByRole('textbox', { name: /^Event name/ }).fill('Company break')
  await page.getByRole('combobox', { name: /Reason/ }).click()
  await page.getByRole('option', { name: 'Company closure', exact: true }).click()
  await page.getByLabel('Start date').fill('2027-02-09')
  await page.getByLabel('End date').fill('2027-02-09')
  await shot('closure-policy')
  await page.getByRole('button', { name: 'Create policy', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('1 balances adjusted')
  await page.getByRole('button', { name: 'Schedule closure', exact: true }).click()
  await expect(page.locator('.leave-table')).toContainText('Company break')
  await shot('policies')
  const balances = await (
    await ctx.get(
      `/api/app/leaves/options?workspaceId=${workspaceId}&id=${memberId}&date=2027-02-01`,
    )
  ).json()
  expect(balances.find((x: { name: string }) => x.name === 'Annual leave').remaining).toBe(9)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Request', exact: true }).click()
  const filterBoxes = await page
    .locator('.leave-list-filters .select-trigger')
    .evaluateAll((nodes) =>
      nodes.map((n) => {
        const r = n.getBoundingClientRect()
        return { left: r.left, right: r.right }
      }),
    )
  for (let i = 1; i < filterBoxes.length; i++)
    expect(filterBoxes[i].left - filterBoxes[i - 1].right).toBeGreaterThanOrEqual(8)
  await shot('mobile-requests')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Record time off', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Record time off', exact: true })).toBeVisible()
  await shot('mobile-record')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Leaves', exact: true }).click()
  await expect(page.locator('.leave-calendar-layout')).toBeVisible()
  await shot('mobile-calendar')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('combobox', { name: /Calendar view/ }).click()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('combobox', { name: /Calendar view/ })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  await page.getByRole('button', { name: 'Leave policy', exact: true }).click()
  await page.getByRole('button', { name: 'Add leave policy', exact: true }).click()
  await page.getByRole('button', { name: /Custom leave Leave requested/ }).click()
  await page.getByRole('textbox', { name: /^Leave name/ }).fill('Unsaved policy')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await shot('mobile-policy')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Discard your changes?' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
  await expect(page.getByRole('textbox', { name: /^Leave name/ })).toHaveValue('Unsaved policy')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await expect(page.locator('.leave-table')).toBeVisible()
  // Exercise two active employees with the same name and job title.
  const duplicateId = crypto.randomUUID()
  users.push(duplicateId)
  await db.insert(schema.user).values({
    id: duplicateId,
    name: 'Emily Louris',
    email: uniqueEmail('same-name'),
    emailVerified: true,
  })
  await db.insert(schema.workspaceMember).values({
    id: crypto.randomUUID(),
    workspaceId,
    userId: duplicateId,
    firstName: 'Emily',
    lastName: 'Louris',
    jobTitle: 'UI/UX Designer',
    employmentType: 'Full-time',
    startDate: '2020-01-01',
    profileCompleted: true,
  })
  await page.reload()
  await expect(page.locator('.leave-calendar-layout')).toBeVisible()
  await page.getByRole('button', { name: 'Record time off', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Record time off', exact: true })
    .getByRole('button', { name: /^Employee/ })
    .click()
  await page.getByRole('combobox', { name: 'Search employee', exact: true }).fill('Emily')
  const names = await page.getByRole('option').allTextContents()
  expect(names).toHaveLength(2)
  expect(new Set(names).size).toBe(2)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await ctx.dispose()
  await employee.dispose()
})

test('empty leave views keep compact centered artwork and fixed year rows on wide screens', async ({
  page,
}) => {
  const ctx = await client()
  await identity(ctx, 'leaves-empty')
  const workspaceId = await company(ctx, 'Leaves Empty Review')
  workspaces.push(workspaceId)
  await profile(ctx, workspaceId)
  const data = await details(ctx, workspaceId)
  await page.context().addCookies((await ctx.storageState()).cookies)
  await page.setViewportSize({ width: 1440, height: 1024 })
  await page.goto(`/w/${data.workspace.slug}/leaves`)
  await expect(page.locator('.leave-pending-empty')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  const timeline = (await page.locator('.leave-timeline').boundingBox())!
  const divider = (await page.locator('.leave-people-background').boundingBox())!
  expect(divider.y + divider.height).toBe(timeline.y + timeline.height)
  await expect(page.locator('.leave-timeline-row > .leave-person')).toHaveCSS(
    'padding-left',
    '16px',
  )
  const avatar = page.locator('.leave-person .avatar').first()
  await expect(avatar).toHaveCSS('display', 'grid')
  const avatarBox = (await avatar.boundingBox())!
  const initials = (await avatar.locator('span').boundingBox())!
  expect(
    Math.abs(initials.y + initials.height / 2 - avatarBox.y - avatarBox.height / 2),
  ).toBeLessThan(1)
  const empty = (await page.locator('.leave-pending-empty').boundingBox())!
  const illustration = (await page.locator('.leave-pending-empty img').boundingBox())!
  expect(
    Math.abs(illustration.x + illustration.width / 2 - empty.x - empty.width / 2),
  ).toBeLessThan(1)
  mkdirSync('test-results/leaves', { recursive: true })
  await page.screenshot({ path: 'test-results/leaves/empty-week.png' })
  for (const name of ['Request', 'Leave policy']) {
    await page
      .getByRole('navigation', { name: 'Leaves sections' })
      .getByRole('button', { name, exact: true })
      .click()
    await expect(page.locator('.leave-empty img')).toHaveCSS('width', '48px')
    await expect(page.locator('.leave-empty img')).toHaveCSS('height', '48px')
    await expect(page.locator('.leave-empty h2')).toHaveCSS('font-weight', '500')
    await page.screenshot({
      path: `test-results/leaves/empty-${name === 'Request' ? 'requests' : 'policies'}.png`,
    })
  }
  await page
    .getByRole('navigation', { name: 'Leaves sections' })
    .getByRole('button', { name: 'Leaves', exact: true })
    .click()
  await page.getByRole('combobox', { name: /Calendar view/ }).click()
  await page.getByRole('option', { name: 'Year', exact: true }).click()
  await page.getByLabel('Calendar date').fill('2026-01')
  for (const width of [1440, 2560]) {
    await page.setViewportSize({ width, height: 1024 })
    const cards = await page.locator('.leave-mini-month').all()
    expect(cards).toHaveLength(12)
    for (const card of cards) {
      expect((await card.boundingBox())!.height).toBeLessThanOrEqual(322)
      await expect(card.locator('button').first()).toHaveCSS('color', 'rgb(41, 41, 41)')
    }
    const date = page.locator('.leave-mini-days button:not(:disabled)').first()
    expect((await date.boundingBox())!.height).toBe(32)
    await page.screenshot({ path: `test-results/leaves/empty-year-${width}.png` })
  }
  await ctx.dispose()
})
