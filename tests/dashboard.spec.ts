import { test, expect } from '@playwright/test'
import { client, verified, uniqueEmail, company, profile, details } from './helpers'
import { mkdirSync } from 'node:fs'

test('dashboard matches desktop dimensions and remains usable on mobile', async ({ page }) => {
  const ctx = await client()
  await verified(ctx, uniqueEmail('dashboard'))
  const id = await company(ctx, 'Uxer Digital')
  await profile(ctx, id, 'Alex')
  const data = await details(ctx, id)
  await page.context().addCookies((await ctx.storageState()).cookies)
  const url = `/w/${data.workspace.slug}`
  await page.setViewportSize({ width: 1440, height: 1024 })
  await page.goto(`${url}?dashboardPreview=filled`)
  await expect(page.getByRole('heading', { name: 'Good afternoon, Alex' })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  expect((await page.locator('.dash-sidebar').boundingBox())!.width).toBe(240)
  expect((await page.locator('.dash-topbar').boundingBox())!.height).toBe(48)
  await expect(page.getByRole('button', { name: 'Open menu', exact: true })).not.toBeVisible()
  const sidebar = page.locator('.dash-sidebar')
  expect(await sidebar.locator('.dash-switcher').boundingBox()).toMatchObject({
    x: 12,
    y: 56,
    width: 216,
    height: 32,
  })
  expect(
    await sidebar.getByRole('link', { name: 'Dashboard', exact: true }).boundingBox(),
  ).toMatchObject({ x: 12, y: 104, width: 216, height: 32 })
  await expect(sidebar.getByRole('link', { name: 'Dashboard', exact: true })).toHaveCSS(
    'font-weight',
    '500',
  )
  await expect(sidebar.getByRole('link', { name: 'Dashboard', exact: true })).toHaveCSS(
    'border-radius',
    '10px',
  )
  expect((await sidebar.getByText('TIME', { exact: true }).boundingBox())!.y).toBe(296)
  expect((await sidebar.getByText('PERSONAL', { exact: true }).boundingBox())!.y).toBe(448)
  expect((await sidebar.getByText('MANAGEMENT', { exact: true }).boundingBox())!.y).toBe(564)
  await expect(page.getByRole('button', { name: 'Open Assistant', exact: true })).toHaveCSS(
    'font-size',
    '14px',
  )
  await expect(page.getByRole('button', { name: 'Review', exact: true }).first()).toHaveCSS(
    'font-size',
    '14px',
  )
  const metric = await page.locator('.dashboard-metric').first().boundingBox()
  expect(metric!.x).toBe(304)
  expect(metric!.width).toBe(344)
  expect(metric!.height).toBe(124)
  expect((await page.locator('.attention-card').boundingBox())!.width).toBe(708)
  expect((await page.locator('.quick-notes').boundingBox())!.width).toBe(344)
  for (const n of await page.locator('.dashboard-metric strong').allTextContents())
    expect(n).toMatch(/^\d+$/)
  mkdirSync('test-results/screens', { recursive: true })
  await page.screenshot({ path: 'test-results/screens/dashboard-desktop.png', fullPage: true })
  await page
    .locator('.dashboard-legend img')
    .first()
    .screenshot({ path: 'test-results/screens/legend-green.png' })
  await page.getByRole('button', { name: 'Open Assistant', exact: true }).click()
  const assistant = page.getByRole('dialog', { name: 'Assistant', exact: true })
  await expect(assistant).toBeVisible()
  await expect
    .poll(() => assistant.boundingBox())
    .toMatchObject({ x: 1032, y: 48, width: 408, height: 976 })
  await expect
    .poll(() => page.locator('.assistant-panel').boundingBox())
    .toMatchObject({
      x: 1040,
      y: 56,
      width: 392,
      height: 960,
    })
  expect(await page.locator('.assistant-start').boundingBox()).toMatchObject({
    x: 1080,
    y: 313,
    width: 312,
    height: 344,
  })
  expect((await page.locator('.assistant-composer').boundingBox())!.height).toBe(102)
  await expect(page.getByRole('heading', { name: 'Rekann Assistant' })).toHaveCSS(
    'font-size',
    '20px',
  )
  expect(await page.locator('.dash-main').boundingBox()).toMatchObject({ x: 240, width: 792 })
  expect((await page.locator('.dashboard-metric').first().boundingBox())!.height).toBe(124)
  await expect(page.locator('.dashboard-metric img').first()).not.toBeVisible()
  await page.screenshot({ path: 'test-results/screens/dashboard-assistant.png' })
  const trigger = page.getByRole('button', { name: 'Open Assistant', exact: true })
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  // Closing must not squeeze three columns into an intermediate drawer width.
  const closingWidths = await page.evaluate(async () => {
    const frames: { width: number; metricHeight: number; overflow: boolean }[] = []
    for (let i = 0; i < 16; i++) {
      await new Promise(requestAnimationFrame)
      frames.push({
        width: document.querySelector('.dash-main')!.getBoundingClientRect().width,
        metricHeight: document.querySelector('.dashboard-metric')!.getBoundingClientRect().height,
        overflow: document.documentElement.scrollWidth > innerWidth,
      })
    }
    return frames
  })
  for (const frame of closingWidths)
    expect(frame).toEqual({ width: 1200, metricHeight: 124, overflow: false })
  await expect(assistant).not.toBeVisible()
  expect((await page.locator('.dash-main').boundingBox())!.width).toBe(1200)
  // Reversing a transition must leave a single usable drawer in the requested state.
  await trigger.click()
  await trigger.click()
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect
    .poll(() => page.locator('.assistant-panel').boundingBox())
    .toMatchObject({ x: 1040, width: 392 })
  await expect.poll(() => page.locator('.dash-main').boundingBox()).toMatchObject({ width: 792 })
  expect(
    await page
      .locator('.dashboard-legend img')
      .evaluateAll((nodes) =>
        nodes.every(
          (node) =>
            (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0,
        ),
      ),
  ).toBe(true)
  await page.getByRole('button', { name: 'Expand Assistant', exact: true }).click()
  await expect(assistant).toHaveClass(/assistant-expanded/)
  await page.getByRole('button', { name: 'Restore Assistant', exact: true }).click()
  await page.getByRole('button', { name: 'Who is off this week', exact: true }).click()
  await expect(page.getByText('4 employees are off this week.', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(assistant).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Open Assistant', exact: true })).toBeFocused()
  await page.getByLabel('Personal notes').fill('A'.repeat(1000))
  await page.getByLabel('Add checklist item').click()
  await page.getByLabel('Checklist item 2').fill('Review the onboarding checklist')
  await page.getByLabel('Checklist item 2').press('Enter')
  await expect(page.getByLabel('Checklist item 3')).toBeFocused()
  await page.getByLabel('Checklist item 3').press('Enter')
  await expect(page.getByLabel('Personal notes line 3')).toBeFocused()
  await page.getByLabel('Personal notes line 3').fill('Follow up tomorrow')
  await page.getByRole('checkbox', { name: 'Review the onboarding checklist' }).check()
  await page.reload()
  await expect(page.getByLabel('Personal notes')).toHaveValue('A'.repeat(1000))
  await expect(
    page.getByRole('checkbox', { name: 'Review the onboarding checklist' }),
  ).toBeChecked()
  for (const width of [1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true)
    const cards = await page
      .locator('.dashboard-card,.dashboard-metric,.quick-notes')
      .evaluateAll((nodes) => nodes.map((n) => ({ width: n.clientWidth, scroll: n.scrollWidth })))
    for (const c of cards) expect(c.scroll).toBeLessThanOrEqual(c.width + 1)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).not.toBeVisible()
  await page.screenshot({ path: 'test-results/screens/dashboard-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Open menu', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Workspace menu' })).toBeVisible()
  await page.screenshot({ path: 'test-results/screens/dashboard-menu.png' })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Open menu', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Open Assistant', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Assistant', exact: true })).toBeVisible()
  await expect
    .poll(() => assistant.boundingBox())
    .toMatchObject({ x: 0, y: 0, width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/screens/dashboard-assistant-mobile.png' })
  await page.getByRole('button', { name: 'Close Assistant' }).click()
  await expect(assistant).not.toBeVisible()
  await page.setViewportSize({ width: 1440, height: 1024 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await trigger.click()
  await expect(page.locator('.dash-main')).toHaveCSS('transition-duration', '0s')
  await expect(assistant).toHaveCSS('transition-duration', '0s')
  await trigger.click()
  await expect(assistant).not.toBeVisible()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  for (const state of ['empty', 'loading', 'error', 'setup']) {
    await page.goto(`${url}?dashboardPreview=${state}`)
    if (state === 'loading')
      await expect(page.getByRole('status', { name: 'Loading dashboard' })).toBeVisible()
    if (state === 'error')
      await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
    await page.screenshot({ path: `test-results/screens/dashboard-${state}.png` })
  }
  await page.goto(url)
  await page.getByRole('button', { name: 'Get started', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome to Rekann, Alex' })).toBeVisible()
  await page.getByLabel('Dismiss setup checklist').click()
  await expect(page.getByRole('heading', { name: 'Ready to get started?' })).toHaveCount(0)
  await ctx.dispose()
})
