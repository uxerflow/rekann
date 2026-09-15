import { test, expect } from '@playwright/test'
import { client, verified, uniqueEmail, post, profile, details } from './helpers'

test('workspace slugs stay unique, stable, authorized, and compatible with old links', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const owner = await client()
  const other = await client()
  await verified(owner, uniqueEmail('slug-owner'))
  await verified(other, uniqueEmail('slug-other'))
  const name = `URL Studio ${crypto.randomUUID().slice(0, 8)}`
  const input = {
    name,
    description: 'URL checks',
    country: 'Indonesia',
    industry: 'Technology',
    timeZone: 'Asia/Jakarta',
  }
  const [first, second] = await Promise.all([
    post(owner, 'workspace/create', input),
    post(other, 'workspace/create', input),
  ])
  expect(first.slug).not.toBe(second.slug)
  expect([first.slug, second.slug].sort()).toEqual(
    [
      name.toLowerCase().replaceAll(' ', '-'),
      `${name.toLowerCase().replaceAll(' ', '-')}-2`,
    ].sort(),
  )
  await post(owner, 'workspace/onboarding-update', {
    ...input,
    name: 'Renamed company',
    workspaceId: first.id,
  })
  expect((await details(owner, first.id)).workspace.slug).toBe(first.slug)
  const context = await browser.newContext({ storageState: await owner.storageState() })
  const page = await context.newPage()
  await page.goto(`/onboarding/profile?workspaceId=${first.id}`)
  await expect(page).toHaveURL(`/w/${first.slug}/onboarding/profile`)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await expect(page).toHaveURL(`/w/${first.slug}/onboarding/company`)
  await page.reload()
  await expect(page.getByLabel('Company name')).toHaveValue('Renamed company')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page).toHaveURL(`/w/${first.slug}/onboarding/profile`)
  await page.goto(`/w/${second.slug}`)
  await expect(page.getByRole('heading', { name: 'Welcome, Alex' })).toHaveCount(0)
  await expect(page.getByText(name, { exact: true })).toHaveCount(0)
  await profile(owner, first.id)
  await page.goto(`/workspace/${first.id}?view=team`)
  await expect(page).toHaveURL(`/w/${first.slug}/team`)
  await expect(page.getByRole('heading', { name: 'Team', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Team', exact: true })).toBeVisible()
  await page.goto(`/onboarding/profile?workspaceId=${first.id}`)
  await expect(page).toHaveURL(`/w/${first.slug}/profile`)
  await expect(page.getByRole('heading', { name: 'Edit your profile' })).toBeVisible()
  await context.close()
  await owner.dispose()
  await other.dispose()
})
