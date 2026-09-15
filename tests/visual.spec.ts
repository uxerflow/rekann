import { test, expect, type Locator } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { client, uniqueEmail, verified } from './helpers'

async function bounds(
  locator: Locator,
  expected: { x?: number; y?: number; width?: number; height?: number },
) {
  const actual = await locator.boundingBox()
  expect(actual).not.toBeNull()
  for (const [key, value] of Object.entries(expected)) {
    expect(
      Math.abs(actual![key as keyof typeof actual] - value),
      `${key} differs from the Figma frame`,
    ).toBeLessThanOrEqual(1)
  }
}

test('Figma desktop dimensions, field states, onboarding cards, and avatar selection', async ({
  page,
}) => {
  test.setTimeout(180_000)
  mkdirSync('test-results/screens', { recursive: true })
  await page.setViewportSize({ width: 1440, height: 936 })
  await page.goto('/sign-in')
  const email = page.getByLabel('Email address')
  await expect(email).toBeEnabled()
  await page.evaluate(() => document.fonts.ready)
  await bounds(page.locator('.auth-heading'), { x: 536, y: 288, width: 368, height: 60 })
  await bounds(email, { x: 536, y: 380, width: 368, height: 36 })
  await expect(email).toHaveCSS('border-radius', '10px')
  await expect(email).toHaveCSS('font-family', 'Inter, sans-serif')
  await expect(email).toHaveCSS('font-size', '14px')
  await expect(email).toHaveCSS('border-color', 'rgb(229, 229, 229)')
  await expect(email).toHaveCSS('cursor', 'text')
  const signIn = page.getByRole('button', { name: 'Sign in', exact: true })
  await expect(signIn).toHaveCSS('background-color', 'rgb(29, 165, 120)')
  await expect(signIn).toHaveCSS('cursor', 'pointer')
  await page.screenshot({ path: 'test-results/screens/auth-default-1440.png' })
  await email.focus()
  await expect(email).toHaveCSS(
    'box-shadow',
    'rgb(255, 255, 255) 0px 0px 0px 1px, rgb(29, 165, 120) 0px 0px 0px 2px',
  )
  await page.screenshot({ path: 'test-results/screens/auth-focused-1440.png' })
  await email.fill('alex@company.test')
  await page.getByLabel('Password', { exact: true }).fill('A sample passphrase')
  await email.focus()
  await page.screenshot({ path: 'test-results/screens/auth-filled-1440.png' })
  await page.goto('/verify-email?email=alex%40company.test')
  await page.getByLabel('6-digit verification code').fill('123456')
  await expect(page.locator('.otp-slot')).toHaveCount(6)
  await bounds(page.locator('.otp-slot').first(), { x: 536, y: 408, width: 40, height: 40 })
  await expect(page.locator('.otp-slot').first()).toHaveCSS('border-radius', '10px')
  await page.screenshot({ path: 'test-results/screens/verification-1440.png' })

  const owner = await client()
  await verified(owner, uniqueEmail('visual'))
  await page.context().addCookies((await owner.storageState()).cookies)
  await page.goto('/onboarding/company')
  await expect(page.getByLabel('Company name')).toBeEnabled()
  await page.evaluate(() => document.fonts.ready)
  await bounds(page.locator('.onboarding-header'), { height: 48 })
  await bounds(page.locator('.onboarding-heading'), { x: 720, y: 128, width: 480, height: 60 })
  await bounds(page.locator('.image-picker'), { x: 720, y: 246, width: 480, height: 88 })
  await bounds(page.getByLabel('Company name'), { x: 720, y: 376, width: 480, height: 36 })
  await bounds(page.locator('.company-preview'), { x: 72, y: 268, width: 336, height: 338 })
  await page.screenshot({ path: 'test-results/screens/company-empty-1440.png' })
  await page.getByLabel('Company name').fill('Uxer Digital')
  await page
    .getByLabel('Company description')
    .fill('We’re a technology company building products that help people work better together')
  await page.getByLabel('Location', { exact: false }).click()
  await page.getByRole('option', { name: 'Indonesia', exact: true }).click()
  await page.getByRole('combobox', { name: /Industry/ }).click()
  await page.getByRole('option', { name: 'Technology', exact: true }).click()
  await expect(page.getByLabel('Location')).toHaveCSS('cursor', 'pointer')
  await page.getByRole('heading').first().click()
  await bounds(page.getByRole('button', { name: 'Continue', exact: true }), {
    x: 1115,
    y: 748,
    width: 85,
    height: 36,
  })
  await page.screenshot({ path: 'test-results/screens/company-filled-1440.png' })
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByLabel('First name')).toBeEnabled()
  await page.evaluate(() => document.fonts.ready)
  await bounds(page.locator('.profile-preview'), { x: 72, y: 254, width: 336, height: 414 })
  await bounds(page.locator('.profile-preview .avatar'), {
    x: 111,
    y: 301,
    width: 258,
    height: 258,
  })
  await bounds(page.getByLabel('First name'), { x: 720, y: 376, width: 232, height: 36 })
  await bounds(page.getByRole('button', { name: 'Continue', exact: true }), {
    x: 1115,
    y: 522,
    width: 85,
    height: 36,
  })
  await bounds(page.getByRole('button', { name: 'Choose avatar', exact: true }), {
    x: 808,
    y: 288,
    width: 120,
    height: 32,
  })
  await bounds(page.locator('.file-button'), { x: 936, y: 288, width: 115, height: 32 })
  await page.screenshot({ path: 'test-results/screens/profile-empty-1440.png' })
  await page.getByLabel('First name').fill('Alex')
  await page.getByLabel('Last name').fill('Carter')
  await page.getByLabel('Job title').fill('CEO/Founder')
  await page.getByRole('button', { name: 'Choose avatar', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('.avatar-option')).toHaveCount(40)
  await expect(page.locator('.avatar-gradient')).toHaveCount(4)
  await page.screenshot({ path: 'test-results/screens/avatar-picker.png' })
  await page.getByRole('button', { name: 'Choose Jade avatar', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.locator('.profile-preview img[src^="data:image/png"]')).toBeVisible()
  await page.getByRole('button', { name: 'Choose avatar', exact: true }).click()
  await page.getByRole('button', { name: 'Choose avatar 1', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.locator('.profile-preview img[src^="data:image/png"]')).toBeVisible()
  await page.getByRole('heading').first().click()
  await page.screenshot({ path: 'test-results/screens/profile-filled-1440.png' })
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByText('Step 3/3')).toBeVisible()
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page.getByLabel('First name')).toHaveValue('Alex')
  await expect(page.locator('.profile-preview img[src^="data:image/png"]')).toBeVisible()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Go to workspace', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome, Alex' })).toBeVisible()
  await owner.dispose()
})
