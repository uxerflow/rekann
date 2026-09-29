import { test, expect } from '@playwright/test'
import { client, uniqueEmail, company, profile, details, password } from './helpers'
import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import { hashPassword } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import * as schema from '../src/server/schema'
import { message, saveSettings } from '../src/server/ai/service'
import { mkdirSync } from 'node:fs'
process.loadEnvFile('.dev.vars')
if (
  process.env.APP_ENV !== 'local' ||
  process.env.BETTER_AUTH_URL !== 'http://127.0.0.1:4310' ||
  !new URL(process.env.DATABASE_URL!).hostname.startsWith('ep-nameless-wind-b33lseje')
)
  throw Error('AI browser tests require development')
neonConfig.webSocketConstructor = ws
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = drizzle(pool, { schema })

test('AI settings, draft review and confirmation persist through the real authenticated API', async ({
  page,
}) => {
  const ctx = await client()
  const userId = crypto.randomUUID()
  const email = uniqueEmail('ai-owner')
  let workspaceId = ''
  try {
    await db.insert(schema.user).values({ id: userId, name: 'Alex', email, emailVerified: true })
    await db.insert(schema.account).values({
      id: crypto.randomUUID(),
      userId,
      accountId: userId,
      providerId: 'credential',
      password: await hashPassword(password),
    })
    expect(
      (await ctx.post('/api/auth/sign-in/email', { data: { email, password } })).status(),
    ).toBe(200)
    workspaceId = await company(ctx, 'AI Browser Test')
    await profile(ctx, workspaceId, 'Alex')
    const data = await details(ctx, workspaceId)
    await page.context().addCookies((await ctx.storageState()).cookies)
    await page.setViewportSize({ width: 1440, height: 1024 })
    const url = '/w/' + data.workspace.slug + '/ai'
    await page.goto(url)
    await expect(page.getByRole('heading', { name: 'Hello, Alex' })).toBeVisible()
    await expect(page.getByText('Your assistant is getting ready', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add attachment (coming soon)' })).toBeDisabled()
    const composerInput = page.getByRole('textbox', { name: 'Message Rekann AI' })
    await expect(composerInput).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(composerInput).toHaveCSS('resize', 'none')
    const contextPicker = page.getByRole('combobox', { name: /Data context/ })
    await contextPicker.click()
    await expect(page.getByRole('option', { name: 'Attendance', exact: true })).toBeDisabled()
    const contextRail = page.locator('.select-popup .scroll-track')
    await expect(contextRail).toBeVisible()
    const contextRow = page.getByRole('option', { name: 'Team directory', exact: true })
    await expect
      .poll(async () => {
        const rail = (await contextRail.boundingBox())!
        const row = (await contextRow.boundingBox())!
        return rail.x - row.x - row.width
      })
      .toBeGreaterThanOrEqual(4)
    await page.screenshot({ path: 'test-results/ai-context-menu.png', animations: 'disabled' })
    await page.getByRole('option', { name: 'Attendance', exact: true }).hover()
    await expect(page.locator('.select-popup .select-highlight')).toHaveCSS('opacity', '0')
    await page.mouse.wheel(0, 400)
    await expect(page.getByRole('option', { name: 'Projects', exact: true })).toBeInViewport()
    await contextPicker.press('End')
    await contextPicker.press('Enter')
    await expect(contextPicker).toContainText('Team directory')
    await contextPicker.click()
    await page.getByRole('option', { name: 'Team directory', exact: true }).click()
    await expect(page.getByRole('listbox')).toHaveCount(0)
    const modelPicker = page.getByRole('combobox', { name: /AI model/ })
    await modelPicker.click()
    await expect(page.getByRole('option', { name: 'Rekann AI', exact: true })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'AI settings' })).toHaveCount(0)
    await expect(page.locator('.select-popup .scroll-track')).toHaveCount(0)
    await expect(page.getByText('OWN AI PROVIDER', { exact: true })).toBeVisible()
    const initialAllowance = (
      await (await ctx.get('/api/app/ai/settings?workspaceId=' + workspaceId)).json()
    ).requestAllowance
    await expect(
      page.getByText(
        `${initialAllowance.remaining} of ${initialAllowance.limit} requests left today`,
        { exact: true },
      ),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Connect AI provider', exact: true }),
    ).toBeInViewport()
    await page.screenshot({
      path: 'test-results/ai-model-menu.png',
      fullPage: true,
      animations: 'disabled',
    })
    await expect(page.locator('.select-popup .scroll-track')).toHaveCount(0)
    await modelPicker.press('Tab')
    await expect(
      page.getByRole('button', { name: 'Connect AI provider', exact: true }),
    ).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'AI settings' })).toBeVisible()
    await expect(page.getByRole('combobox', { name: /Workspace connection/ })).toContainText(
      'Your OpenRouter key',
    )
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    if (await page.getByRole('heading', { name: 'Discard your changes?' }).isVisible())
      await page.getByRole('button', { name: 'Discard changes' }).click()
    await modelPicker.click()
    await modelPicker.press('Escape')
    await expect(modelPicker).toBeFocused()
    await expect(
      page.getByText('Messages and enabled memory go to OpenRouter.', { exact: false }),
    ).toHaveCount(0)
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(modelPicker).toBeInViewport()
    await modelPicker.click()
    await expect(
      page.getByRole('button', { name: 'Connect AI provider', exact: true }),
    ).toBeInViewport()
    await expect(page.locator('.select-popup .scroll-track')).toHaveCount(0)
    await page.screenshot({ path: 'test-results/ai-model-menu-mobile.png', animations: 'disabled' })
    await modelPicker.press('Escape')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: 'test-results/ai-composer-mobile.png',
      fullPage: true,
      animations: 'disabled',
    })
    await page.setViewportSize({ width: 1440, height: 1024 })
    await page.screenshot({ path: 'test-results/ai-default-banner.png', fullPage: true })
    await page.getByRole('button', { name: 'AI settings', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'AI settings' })).toBeVisible()
    const connection = page.getByRole('combobox', { name: /Workspace connection/ })
    await expect(connection).toContainText('Rekann AI')
    await expect(page.getByLabel('Enable Rekann AI')).toHaveCount(0)
    await expect(page.getByText('Included allowance', { exact: true })).toHaveCount(0)
    await page.screenshot({
      path: 'test-results/ai-included-settings.png',
      fullPage: true,
      animations: 'disabled',
    })
    await page.getByText('Access and permissions', { exact: true }).click()
    await page.getByLabel('Pause AI for this workspace').check()
    await connection.click()
    await page.getByRole('option', { name: 'Your OpenRouter key', exact: true }).click()
    await connection.click()
    await page.getByRole('option', { name: 'Rekann AI', exact: true }).click()
    await expect(page.getByLabel('Pause AI for this workspace')).not.toBeChecked()
    await page.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const current = await ctx.get('/api/app/ai/settings?workspaceId=' + workspaceId)
    expect(await current.json()).toMatchObject({
      funding: 'rekann',
      enabled: true,
      available: true,
      version: 1,
    })
    await page.getByRole('button', { name: 'AI settings', exact: true }).click()
    await connection.click()
    await page.getByRole('option', { name: 'Your OpenRouter key', exact: true }).click()
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await page.getByText('Usage limits', { exact: true }).click()
    await expect(page.getByLabel('Workspace tokens, monthly')).toHaveValue('100,000')
    await page.getByLabel('Workspace tokens, monthly').fill('250000')
    await page.getByLabel('Requests per person, daily').focus()
    await expect(page.getByLabel('Workspace tokens, monthly')).toHaveValue('250,000')
    await page.getByText('Access and permissions', { exact: true }).click()
    const rail = page.locator('.ai-dialog .scroll-track')
    const field = page.getByLabel('Workspace tokens, monthly')
    await field.scrollIntoViewIfNeeded()
    const railBox = (await rail.boundingBox())!
    const fieldBox = (await field.boundingBox())!
    expect(railBox.x - (fieldBox.x + fieldBox.width)).toBeGreaterThanOrEqual(4)
    await page.setViewportSize({ width: 390, height: 640 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeInViewport()
    await page.screenshot({ path: 'test-results/ai-settings-mobile.png', fullPage: true })
    await page.setViewportSize({ width: 1440, height: 1024 })
    await page.getByLabel('API key', { exact: true }).fill('test-key-never-used')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Discard your changes?' })).toBeVisible()
    await page.getByRole('button', { name: 'Discard changes' }).click()
    // Provider authentication/inference is stubbed only at the service boundary in tests.
    // Browser authorization, review, validation and database commits use the real API.
    await saveSettings(
      db,
      userId,
      {
        workspaceId,
        version: 1,
        enabled: true,
        allowWrites: true,
        allowedRoles: ['admin'],
        monthlyTokens: 100000,
        dailyRequests: 30,
        apiKey: 'test-key-not-a-real-provider-key',
      },
      process.env.AI_ENCRYPTION_KEY,
      async () => {},
    )
    await page.reload()
    await expect(page.getByRole('textbox', { name: 'Message Rekann AI' })).toBeEnabled()
    await page.evaluate(() => document.fonts.ready)
    mkdirSync('test-results/screens', { recursive: true })
    await page.screenshot({ path: 'test-results/screens/ai-idle.png', fullPage: true })
    await page.getByRole('button', { name: 'Your memory', exact: true }).click()
    await page
      .getByLabel('What should Rekann remember?')
      .fill('Our Product Studio means the Design department.')
    await page.getByRole('button', { name: 'Save memory', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: 'Your memory', exact: true }).click()
    await expect(page.getByLabel('What should Rekann remember?')).toHaveValue(
      'Our Product Studio means the Design department.',
    )
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()

    expect((await page.locator('.ai-welcome').boundingBox())!.width).toBe(784)
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
    }
    await page.setViewportSize({ width: 1440, height: 1024 })
    const turn = await message(
      db,
      userId,
      { workspaceId, requestId: crypto.randomUUID(), message: 'Add Taylor Lee to our team' },
      process.env.AI_ENCRYPTION_KEY,
      async () => ({
        plan: {
          action: 'create',
          query: '',
          department: '',
          changes: [{ field: 'fullName', value: 'Taylor Lee' }],
        },
        tokens: 120,
      }),
    )
    await page.reload()
    await modelPicker.click()
    await expect(page.getByText('29 of 30 requests left today', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Manage AI provider', exact: true }),
    ).toBeVisible()
    await modelPicker.press('Escape')
    await expect(page.getByRole('button', { name: 'Add employee', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Review details' }).click()
    await page.getByRole('textbox', { name: 'Work email' }).fill(uniqueEmail('ai-taylor'))
    await page.getByRole('textbox', { name: 'Employee ID' }).fill('EMP1001')
    await page.getByLabel('Start date').fill('2026-09-27')
    await page.getByRole('textbox', { name: 'Job title' }).fill('Designer')
    await page.getByRole('button', { name: 'Save draft' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.screenshot({ path: 'test-results/screens/ai-draft.png', fullPage: true })
    expect(
      await db
        .select()
        .from(schema.employeeRecord)
        .where(eq(schema.employeeRecord.workspaceId, workspaceId)),
    ).toHaveLength(0)
    await page.getByRole('button', { name: 'Add employee', exact: true }).click()
    await expect(page.getByText('Your employee has been added.', { exact: false })).toBeVisible()
    expect(
      (await db.select().from(schema.aiTurn).where(eq(schema.aiTurn.id, turn.id)))[0].status,
    ).toBe('confirmed')
    await page.getByRole('link', { name: 'View employee' }).click()
    await expect(page.getByRole('heading', { name: 'Taylor Lee', exact: true })).toBeVisible()
    await page.goto('/w/' + data.workspace.slug + '/team')
    await page.getByRole('button', { name: 'Open Assistant', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Rekann AI', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Message Rekann AI' })).toBeEnabled()
    await page.screenshot({ path: 'test-results/screens/ai-drawer.png', fullPage: true })
    await page.getByRole('button', { name: 'Close Assistant', exact: true }).click()

    await page.goto(url)
    await page.getByRole('button', { name: 'Your memory', exact: true }).click()
    await page.getByRole('button', { name: 'Forget everything', exact: true }).click()
    await page.getByRole('button', { name: 'Clear memory', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Hello, Alex' })).toBeVisible()
    expect(
      await db
        .select()
        .from(schema.employeeRecord)
        .where(eq(schema.employeeRecord.workspaceId, workspaceId)),
    ).toHaveLength(1)
    await page.getByRole('button', { name: 'AI settings', exact: true }).click()
    await page.getByRole('button', { name: 'Remove key and use Rekann AI', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Use your own key' })).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: 'Message Rekann AI' })).toBeEnabled()
  } finally {
    if (workspaceId) await db.delete(schema.workspace).where(eq(schema.workspace.id, workspaceId))
    await db.delete(schema.session).where(eq(schema.session.userId, userId))
    await db.delete(schema.account).where(eq(schema.account.userId, userId))
    await db.delete(schema.user).where(eq(schema.user.id, userId))
    await ctx.dispose()
  }
})
test('Cloudflare live included AI works without any workspace key', async () => {
  test.skip(process.env.REKANN_AI_LIVE_TEST !== '1', 'Opt in to account-backed model inference')
  const ctx = await client()
  const userId = crypto.randomUUID()
  const email = uniqueEmail('ai-cloudflare')
  let workspaceId = ''
  try {
    await db
      .insert(schema.user)
      .values({ id: userId, name: 'Cloudflare Test', email, emailVerified: true })
    await db.insert(schema.account).values({
      id: crypto.randomUUID(),
      userId,
      accountId: userId,
      providerId: 'credential',
      password: await hashPassword(password),
    })
    expect(
      (await ctx.post('/api/auth/sign-in/email', { data: { email, password } })).status(),
    ).toBe(200)
    workspaceId = await company(ctx, 'Cloudflare AI Test')
    await profile(ctx, workspaceId, 'Cloudflare Test')
    expect(
      await (await ctx.get('/api/app/ai/settings?workspaceId=' + workspaceId)).json(),
    ).toMatchObject({
      funding: 'rekann',
      available: true,
      workspaceKeyConnected: false,
      model: '@cf/meta/llama-3.1-8b-instruct-fp8-fast',
    })
    const requestId = crypto.randomUUID()
    const started = Date.now()
    const response = await ctx.post('/api/app/ai/message', {
      data: { workspaceId, requestId, message: 'How many employees are in our team directory?' },
    })
    const turn = await response.json()
    expect(response.status()).toBe(200)
    expect(turn).toMatchObject({ status: 'done', result: { total: 1 } })
    const [saved] = await db.select().from(schema.aiTurn).where(eq(schema.aiTurn.id, requestId))
    expect(saved.tokens).toBeGreaterThan(0)
    expect(saved.tokens).toBeLessThan(16384)
    console.log(
      JSON.stringify({
        provider: 'Cloudflare Workers AI',
        latencyMs: Date.now() - started,
        tokens: saved.tokens,
      }),
    )
    const followUp = await ctx.post('/api/app/ai/message', {
      data: {
        workspaceId,
        requestId: crypto.randomUUID(),
        message: 'Berapa jumlah karyawan di team directory kami?',
      },
    })
    expect(await followUp.json()).toMatchObject({ status: 'done', result: { total: 1 } })
  } finally {
    if (workspaceId) await db.delete(schema.workspace).where(eq(schema.workspace.id, workspaceId))
    await db.delete(schema.session).where(eq(schema.session.userId, userId))
    await db.delete(schema.account).where(eq(schema.account.userId, userId))
    await db.delete(schema.user).where(eq(schema.user.id, userId))
    await ctx.dispose()
  }
})
test.afterAll(async () => {
  await pool.end()
})
