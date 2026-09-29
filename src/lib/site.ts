import { createServerFn } from '@tanstack/react-start'
export const loadSiteMode = createServerFn({ method: 'GET' }).handler(async () => {
  const { env } = await import('cloudflare:workers')
  return (env as unknown as { SITE_MODE?: string }).SITE_MODE === 'waitlist'
})
