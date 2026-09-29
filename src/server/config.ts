import { z } from 'zod'

export const configSchema = z.object({
  DATABASE_URL: z.string().startsWith('postgres'),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  APP_ENV: z.enum(['local', 'production']).default('production'),
  EMAIL_DELIVERY: z.enum(['local', 'resend']).default('resend'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  SITE_MODE: z.enum(['app', 'waitlist']).default('app'),
  WAITLIST_URL: z.url().default('https://rekann.app'),
  WAITLIST_TOKEN_SECRET: z.string().min(32).optional(),
  RESEND_CONTACTS_API_KEY: z.string().optional(),
  RESEND_WAITLIST_SEGMENT_ID: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
})
export type AppConfig = z.infer<typeof configSchema>
export function readConfig(input: unknown): AppConfig {
  const config = configSchema.parse(input)
  const url = new URL(config.BETTER_AUTH_URL)
  if (config.APP_ENV === 'production' && new URL(config.WAITLIST_URL).protocol !== 'https:')
    throw new Error('Production waitlist requires HTTPS.')
  if (config.APP_ENV === 'production' && url.protocol !== 'https:')
    throw new Error('Production requires HTTPS.')
  if (
    config.EMAIL_DELIVERY === 'local' &&
    (config.APP_ENV !== 'local' || !['127.0.0.1', 'localhost'].includes(url.hostname))
  ) {
    throw new Error('Local email delivery is only available on localhost.')
  }
  return config
}
