import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { otp, uniqueEmail, password, client, company, invite, verified } from './helpers'

test('desktop signup, verification, onboarding, image upload, team, and access settings', async ({
  page,
}) => {
  test.setTimeout(240_000)
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': '198.51.100.150' })
  await page.setViewportSize({ width: 1440, height: 936 })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const email = uniqueEmail('browser')
  mkdirSync('test-results/screens', { recursive: true })
  await page.goto('/sign-in')
  await expect(page.getByRole('heading', { name: 'Welcome to Rekann' })).toBeVisible()
  await expect(page.getByLabel('Email address')).toBeEnabled()
  await page.screenshot({ path: 'test-results/screens/sign-in-desktop.png', fullPage: true })
  await page.getByRole('link', { name: 'Create an account', exact: true }).click()
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password', { exact: true }).fill('Does not match yet!')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Passwords do not match')
  await page.getByLabel('Confirm password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await page.getByLabel('6-digit verification code').fill(await otp(email))
  await page.getByRole('button', { name: 'Verify email', exact: true }).click()
  await expect(page).toHaveURL(/\/onboarding\/company$/)
  await expect(page.getByRole('heading', { name: 'Tell us about your company' })).toBeVisible()
  await page.getByLabel('Company name').fill('Northstar Studio')
  await page
    .getByLabel('Company description')
    .fill('A small design team making thoughtful digital products.')
  await page.getByLabel('Location').selectOption('Indonesia')
  await page.getByLabel('Industry').selectOption('Design studio')
  // Exercise the real browser image conversion and private R2 upload path.
  const image = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 32
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#14805c'
    ctx.fillRect(0, 0, 32, 32)
    return c.toDataURL('image/png').split(',')[1]
  })
  await page.locator('input[type=file]').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(image, 'base64'),
  })
  await expect(page.getByRole('button', { name: 'Clear selected image' })).toBeVisible()
  await page.screenshot({ path: 'test-results/screens/company-desktop.png', fullPage: true })
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Tell us about yourself' })).toBeVisible()
  await page.getByLabel('First name').fill('Alex')
  await page.getByLabel('Last name').fill('Carter')
  await page.getByLabel('Job title').fill('Founder & Designer')
  await page.screenshot({ path: 'test-results/screens/profile-desktop.png', fullPage: true })
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByLabel('Phone number').fill('+62 812 3456 7890')
  await page.getByLabel('Place of birth').fill('Surabaya')
  await page.getByLabel('Date of birth').fill('1995-06-12')
  await page.screenshot({
    path: 'test-results/screens/personal-details-desktop.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Go to workspace', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome, Alex' })).toBeVisible()
  await expect
    .poll(async () =>
      page
        .locator('img[src*="/api/app/media"]')
        .first()
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0)
  await page.screenshot({ path: 'test-results/screens/workspace-desktop.png', fullPage: true })
  await page.getByRole('link', { name: 'Team', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Team', exact: true })).toBeVisible()
  await expect(page.getByText(email, { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Roles & access', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Enable Manager / HR role' }).check()
  await page.getByRole('checkbox', { name: 'Invite employees' }).check()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('status')).toContainText('Workspace permissions saved')
  await page.screenshot({ path: 'test-results/screens/access-desktop.png', fullPage: true })
  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'Enable Manager / HR role' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Invite employees' })).toBeChecked()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/screens/access-mobile.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome to Rekann' })).toBeVisible()
  expect(errors).toEqual([])
})

test('invited employee joins on mobile and recovers their password', async ({ page }) => {
  test.setTimeout(180_000)
  const owner = await client()
  await verified(owner, uniqueEmail('inviteowner'))
  const workspaceId = await company(owner, 'Employee journey ' + crypto.randomUUID().slice(0, 8))
  const email = uniqueEmail('invitebrowser')
  const token = await invite(owner, workspaceId, email)
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': '198.51.100.175' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/invite/${token}`)
  await page.getByRole('link', { name: 'Create an account', exact: true }).click()
  await page.getByLabel('Email address').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await page.getByLabel('6-digit verification code').fill(await otp(email))
  await page.getByRole('button', { name: 'Verify email', exact: true }).click()
  await page.getByRole('button', { name: 'Accept invitation', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Tell us about yourself' })).toBeVisible()
  await page.getByLabel('First name').fill('Taylor')
  await page.getByLabel('Last name').fill('Reed')
  await page.getByLabel('Job title').fill('Product Designer')
  await page.screenshot({
    path: 'test-results/screens/employee-profile-mobile.png',
    fullPage: true,
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Go to workspace', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome, Taylor' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Roles & access', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await page.getByLabel('Email address').fill(email)
  await page.getByRole('button', { name: 'Send reset code' }).click()
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  await page.getByLabel('6-digit verification code').fill(await otp(email))
  await page.getByLabel('New password', { exact: true }).fill(password + ' reset')
  await page.getByLabel('Confirm password', { exact: true }).fill(password + ' reset')
  await page.getByRole('button', { name: 'Reset password', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Your password has been reset')
  await page.getByLabel('Password', { exact: true }).fill(password + ' reset')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome, Taylor' })).toBeVisible()
  await owner.dispose()
})

test('mobile auth, forgot-password form, keyboard focus, and unavailable invitation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/sign-in')
  await page.getByLabel('Email address').fill('mobile@example.test')
  await page.getByLabel('Password', { exact: true }).fill('Example password')
  await page.getByRole('button', { name: 'Show password', exact: true }).click()
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Hide password', exact: true }).click()
  await page.getByLabel('Email address').focus()
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused()
  await page.screenshot({ path: 'test-results/screens/sign-in-mobile.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible()
  await page.screenshot({ path: 'test-results/screens/forgot-password-mobile.png', fullPage: true })
  await page.goto(`/invite/${'0'.repeat(64)}`)
  await expect(page.getByRole('heading', { name: 'Invitation unavailable' })).toBeVisible()
})
