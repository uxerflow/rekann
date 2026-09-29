import { test, expect } from '@playwright/test'

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/waitlist')
  await expect(page.getByRole('button', { name: 'Join the waitlist' })).toBeEnabled()
  await expect(page.locator('.wl-product')).toHaveAttribute('data-ready', 'true')
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  )
}
for (const viewport of [
  { width: 1440, height: 1024 },
  { width: 392, height: 896 },
  { width: 320, height: 640 },
]) {
  test(`waitlist and update flow at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await ready(page)
    expect(await page.locator('.wl-email').evaluate((n) => n.getBoundingClientRect().height)).toBe(
      40,
    )
    expect(
      await page
        .getByRole('button', { name: 'Join the waitlist' })
        .evaluate((n) => n.getBoundingClientRect().height),
    ).toBe(40)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `test-results/waitlist-${viewport.width}.png` })
    await page.getByRole('button', { name: 'See updates' }).click()
    await expect(page.getByRole('complementary', { name: 'Updates' })).toBeVisible()
    await expect(page.locator('.wl-card')).toHaveCount(2)
    const scroll = page.locator('.wl-feed-scroll .scroll-viewport')
    expect(await scroll.evaluate((n) => n.scrollHeight > n.clientHeight)).toBe(true)
    await page.getByRole('button', { name: /Read update.*Your day/ }).click()
    await expect(page.getByRole('dialog', { name: 'Your day at a glance' })).toBeVisible()
    const preview = page.locator('.wl-article .wl-post-image img')
    expect(
      await preview.evaluate((n: HTMLImageElement) =>
        Math.abs(n.clientWidth / n.clientHeight - 1440 / 1024),
      ),
    ).toBeLessThan(0.01)
    await expect(page.getByRole('link', { name: 'Follow on X' })).toHaveAttribute(
      'href',
      'https://x.com/rekannapp',
    )
    await page.getByRole('button', { name: 'Back to updates' }).click()
    await page.getByRole('button', { name: /Read update.*Getting started/ }).click()
    await expect(page.getByRole('dialog', { name: 'Getting started with Rekann' })).toBeVisible()
    await page.getByRole('button', { name: 'Close dialog' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: 'Close updates' }).click()
    await expect(page.getByRole('button', { name: 'See updates' })).toBeFocused()
    expect(errors).toEqual([])
  })
}
test('single-step success, duplicate fallback, error retry and accessible modal', async ({
  page,
}) => {
  const payloads: unknown[] = []
  let result = 'joined'
  let fail = false
  await page.route('**/api/waitlist/subscribe', async (route) => {
    payloads.push(route.request().postDataJSON())
    await route.fulfill({
      status: fail ? 503 : 200,
      json: fail ? { error: 'Please try again shortly.' } : { result },
    })
  })
  await ready(page)
  await page
    .getByRole('textbox', { name: 'Email address', exact: true })
    .fill('person@example.test')
  await page.getByRole('button', { name: 'Join the waitlist' }).click()
  await expect(page.getByRole('dialog', { name: 'Added to the waitlist.' })).toBeVisible()
  expect(payloads[0]).toEqual({ email: 'person@example.test', website: '' })
  await page
    .getByRole('dialog')
    .evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)))
  await page.screenshot({ path: 'test-results/waitlist-joined.png' })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Join the waitlist' })).toBeFocused()
  result = 'already'
  await page.getByRole('button', { name: 'Join the waitlist' }).click()
  await expect(page.getByRole('dialog', { name: 'You’re already on the list.' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  fail = true
  await page.getByRole('button', { name: 'Join the waitlist' }).click()
  await expect(page.getByRole('alert')).toHaveText('Please try again shortly.')
  await expect(page.getByRole('textbox', { name: 'Email address', exact: true })).toHaveValue(
    'person@example.test',
  )
  await expect(page.getByRole('button', { name: 'Join the waitlist' })).toBeEnabled()
})

test('cold load paints the gradient and form before a delayed preview is decoded', async ({
  page,
}) => {
  const backgroundRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/waitlist/background.webp')) backgroundRequests.push(request.url())
  })
  let releasePreview!: () => void
  const pending = new Promise<void>((resolve) => {
    releasePreview = resolve
  })
  await page.route('**/waitlist/dashboard.webp', async (route) => {
    await pending
    await route.continue()
  })
  await page.goto('/waitlist', { waitUntil: 'domcontentloaded' })
  try {
    await expect(page.getByRole('button', { name: 'Join the waitlist' })).toBeEnabled()
    await expect(page.locator('.wl-product')).toHaveAttribute('data-ready', 'false')
    await expect(page.locator('.wl-product')).toHaveCSS('visibility', 'hidden')
    await expect(page.locator('.wl-page')).toHaveCSS('background-image', /data:image\/webp;base64/)
    await expect(page.locator('.wl-signup')).toHaveCSS('opacity', '1')
    await page.evaluate(() => document.fonts.ready)
    expect(await page.evaluate(() => document.fonts.check('600 56px "Phase Grotesk"'))).toBe(true)
    const formBounds = await page.locator('.wl-signup').boundingBox()
    await page.screenshot({ path: 'test-results/waitlist-cold-pending.png' })
    releasePreview()
    await expect(page.locator('.wl-product')).toHaveAttribute('data-ready', 'true')
    expect(await page.locator('.wl-signup').boundingBox()).toEqual(formBounds)
    expect(
      await page
        .locator('.wl-product img')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    ).toBe(true)
    expect(backgroundRequests).toEqual([])
  } finally {
    releasePreview()
  }
})

test('server-rendered waitlist remains visible without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    await page.goto('http://127.0.0.1:4310/waitlist')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('.wl-product')).toHaveCSS('visibility', 'visible')
    await expect(page.locator('.wl-page')).toHaveCSS('background-image', /data:image\/webp;base64/)
  } finally {
    await context.close()
  }
})

test('typing and leaving the signup form never replay its entrance', async ({ page }) => {
  await ready(page)
  const form = page.locator('.wl-signup')
  const email = page.getByRole('textbox', { name: 'Email address', exact: true })
  await form.evaluate((el) => {
    el.setAttribute('data-animation-starts', '0')
    el.addEventListener('animationstart', () => {
      el.setAttribute(
        'data-animation-starts',
        String(Number(el.getAttribute('data-animation-starts')) + 1),
      )
    })
  })
  for (const value of ['person@', 'person@example.test', '']) {
    await email.fill(value)
    await email.press('Tab')
    await expect(page.getByRole('button', { name: 'Join the waitlist' })).toBeFocused()
    await page.getByRole('heading', { level: 1 }).click()
    await expect(form).toHaveCSS('opacity', '1')
    await expect(form).toHaveCSS('transform', 'none')
    await expect(form).toHaveAttribute('data-animation-starts', '0')
  }
})

test('updates can reverse an exit and reduced motion skips spatial entrances', async ({ page }) => {
  await ready(page)
  const launcher = page.getByRole('button', { name: 'See updates' })
  await launcher.click()
  await page.getByRole('button', { name: 'Close updates' }).click()
  await expect(page.locator('#wl-updates')).toHaveJSProperty('inert', true)
  await launcher.click()
  await expect(page.locator('#wl-updates')).toHaveJSProperty('inert', false)
  await expect(page.locator('#wl-updates')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(page.locator('#wl-updates')).toHaveCount(0)
  await expect(launcher).toBeFocused()

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await ready(page)
  expect(
    await page.locator('.wl-dashboard').evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none')
  await launcher.click()
  await expect(page.locator('#wl-updates')).toBeVisible()
  expect(await page.locator('#wl-updates').evaluate((el) => getComputedStyle(el).transform)).toBe(
    'none',
  )
  await page.keyboard.press('Escape')
  await expect(page.locator('#wl-updates')).toHaveCount(0)
})
test('unsubscribe requires a deliberate POST; no mutation on opening email link', async ({
  page,
}) => {
  let calls = 0
  await page.route('**/api/waitlist/unsubscribe', async (route) => {
    calls++
    expect(route.request().method()).toBe('POST')
    await route.fulfill({ json: { unsubscribed: true } })
  })
  await page.goto('/unsubscribe?token=test-token')
  await expect(page.getByRole('heading', { name: 'Unsubscribe from Rekann?' })).toBeVisible()
  expect(calls).toBe(0)
  await page.getByRole('button', { name: 'Unsubscribe', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'You’re unsubscribed.' })).toBeVisible()
  expect(calls).toBe(1)
})
test('SSR metadata and public API boundary reject cross-origin requests', async ({ request }) => {
  const response = await request.get('/waitlist')
  const html = await response.text()
  expect(html).toContain('https://rekann.app/waitlist/og.png')
  expect(html).toContain('summary_large_image')
  expect(html).toContain('Everything your')
  expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow')
  const bad = await request.post('/api/waitlist/subscribe', {
    headers: { Origin: 'https://attacker.example' },
    data: { email: 'test@example.test' },
  })
  expect(bad.status()).toBe(403)
  expect((await request.get('/api/waitlist/unsubscribe?token=invalid')).status()).toBe(405)
})
