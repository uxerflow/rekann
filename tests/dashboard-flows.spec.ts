import { test, expect } from '@playwright/test'
import { client, verified, uniqueEmail, company, profile, details } from './helpers'
import { mkdirSync } from 'node:fs'

test('welcome, setup and Assistant preview flows preserve data and match design dimensions', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000)
  const ctx = await client()
  await verified(ctx, uniqueEmail('dashboard-flows'))
  const id = await company(ctx, 'Uxer Digital')
  await profile(ctx, id, 'Alex')
  const data = await details(ctx, id)
  await page.context().addCookies((await ctx.storageState()).cookies)
  const url = `/w/${data.workspace.slug}`
  mkdirSync('test-results/flows', { recursive: true })
  await page.setViewportSize({ width: 1440, height: 1024 })
  await page.goto(`${url}?dashboardPreview=welcome`)
  const welcome = page.getByRole('dialog', { name: 'Welcome to Rekann' })
  await expect(welcome).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  expect(await welcome.boundingBox()).toMatchObject({ x: 320, y: 308, width: 800, height: 408 })
  await page.screenshot({ path: 'test-results/flows/welcome.png' })
  await page.getByRole('button', { name: 'Get started', exact: true }).click()
  await expect(welcome).not.toBeVisible()
  const freshBrowser = await browser.newContext()
  try {
    await freshBrowser.addCookies((await ctx.storageState()).cookies)
    const freshPage = await freshBrowser.newPage()
    await freshPage.goto(`${url}?dashboardPreview=welcome`)
    await expect(freshPage.getByRole('dialog', { name: 'Welcome to Rekann' })).not.toBeVisible()
  } finally {
    await freshBrowser.close()
  }
  await expect(page.getByText('0 of 3 complete', { exact: true })).toBeVisible()
  expect(await page.locator('.dashboard-setup').boundingBox()).toMatchObject({
    x: 304,
    y: 172,
    width: 1072,
    height: 278,
  })
  await page.screenshot({ path: 'test-results/flows/setup.png' })
  await page.getByRole('button', { name: 'Set up', exact: true }).first().click()
  await page.getByRole('button', { name: 'Set up', exact: true }).first().click()
  await expect(page.getByText('2 of 3 complete', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/flows/setup-progress.png' })
  await page.reload()
  await expect(welcome).not.toBeVisible()
  await expect(page.getByText('2 of 3 complete', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Set up', exact: true }).click()
  await expect(page.getByText('3 of 3 complete', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/flows/setup-completed.png' })
  await page.getByLabel('Dismiss setup checklist').click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Show setup checklist' })).toBeVisible()
  await page.getByRole('button', { name: 'Show setup checklist' }).click()
  await expect(page.getByText('3 of 3 complete', { exact: true })).toBeVisible()
  // Preview interactions must never call business mutations or model/upload services.
  const mutations: string[] = []
  page.on('request', (request) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) mutations.push(request.url())
  })
  for (const state of ['provider', 'context', 'thinking', 'chat', 'review', 'completed']) {
    await page.goto(`${url}?dashboardPreview=filled&assistantPreview=${state}`)
    const assistant = page.getByRole('dialog', { name: 'Assistant', exact: true })
    await expect(assistant).toBeVisible()
    await expect
      .poll(() => page.locator('.assistant-panel').boundingBox())
      .toMatchObject({ x: 1040, y: 56, width: 392, height: 960 })
    if (state === 'provider') {
      await expect(page.getByRole('menu', { name: 'AI provider' })).toBeVisible()
      await expect
        .poll(() => page.getByRole('menu', { name: 'AI provider' }).boundingBox())
        .toMatchObject({ x: 1149, y: 803, width: 216, height: 128 })
    }
    if (state === 'context') {
      await expect(page.getByRole('menu', { name: 'Workspace context' })).toBeVisible()
      await expect
        .poll(() => page.getByRole('menu', { name: 'Workspace context' }).boundingBox())
        .toMatchObject({ x: 1099, y: 547, width: 240, height: 384 })
    }
    if (state === 'review')
      expect(await page.locator('.assistant-policy-card').boundingBox()).toMatchObject({
        x: 1056,
        y: 269,
        width: 360,
        height: 394,
      })
    if (state === 'chat')
      expect(await page.locator('.assistant-attendance-result').boundingBox()).toMatchObject({
        x: 1056,
        y: 325,
        width: 360,
        height: 298,
      })
    await page.screenshot({ path: `test-results/flows/assistant-${state}.png` })
  }
  await page.goto(`${url}?dashboardPreview=filled&assistantPreview=review`)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByRole('textbox', { name: 'Leave name' }).fill('Changed draft')
  await page
    .locator('.assistant-policy-edit')
    .getByRole('button', { name: 'Cancel', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: 'Maternity leave (draft)' })).toBeVisible()
  await page.getByRole('button', { name: 'Create leave policy', exact: true }).click()
  await page.getByRole('textbox', { name: 'Allowance (days)' }).fill('0')
  await expect(page.getByRole('button', { name: 'Confirm policy' })).toBeDisabled()
  await page.getByRole('textbox', { name: 'Allowance (days)' }).fill('120')
  await page.getByRole('textbox', { name: 'Leave name' }).fill('Parental leave')
  await page.getByRole('button', { name: 'Confirm policy' }).click()
  await expect(page.getByText('Leave policy created successfully', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'View leave policy', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Leave name' })).toHaveValue('Parental leave')
  await expect(page.getByRole('textbox', { name: 'Allowance (days)' })).toHaveValue('120')
  await page.keyboard.press('Escape')
  await expect(page.locator('.assistant-policy-edit')).not.toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Assistant', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'New conversation' }).click()
  await page.getByLabel('Message Assistant').fill('Draft a maternity leave policy.')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status', { name: 'Thinking' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /\(draft\)/ })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByText('Draft cancelled. No changes were saved.')).toBeVisible()
  await page.getByRole('button', { name: 'Add context' }).click()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.locator('.assistant-context-chip')).toContainText('People')
  await page.getByRole('button', { name: 'Select AI provider' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Assistant', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Select AI provider' })).toBeFocused()
  for (const width of [768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await page.getByRole('button', { name: 'Add context' }).click()
    await expect(page.getByRole('menu')).toBeVisible()
    const bounds = (await page.getByRole('menu').boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/flows/assistant-mobile.png' })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Close Assistant' }).click()
  await expect(page.getByRole('dialog', { name: 'Assistant', exact: true })).not.toBeVisible()
  await page.goto(`${url}?dashboardPreview=welcome`)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(welcome).toBeVisible()
  await page.screenshot({ path: 'test-results/flows/welcome-mobile.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(mutations).toEqual([])
  await ctx.dispose()
})
