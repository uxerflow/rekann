import { betterAuth } from 'better-auth/minimal'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { emailOTP } from 'better-auth/plugins'
import type { AppConfig } from './config'
import type { Database } from './db'
import { otpEmail, sendEmail } from './email'
import * as schema from './schema'

export function createAuth(db: Database, config: AppConfig) {
  return betterAuth({
    appName: 'Rekann',
    baseURL: config.BETTER_AUTH_URL,
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: [new URL(config.BETTER_AUTH_URL).origin],
    database: drizzleAdapter(db, { provider: 'pg', schema, transaction: true }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    account: { accountLinking: { enabled: false } },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: {
        '/sign-up/email': { window: 60, max: 5 },
        '/sign-in/email': { window: 60, max: 5 },
      },
    },
    advanced: {
      useSecureCookies: config.APP_ENV === 'production',
      ipAddress: {
        ipAddressHeaders:
          config.APP_ENV === 'production' ? ['cf-connecting-ip'] : ['x-forwarded-for'],
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        disableSignUp: true,
        overrideDefaultEmailVerification: true,
        async sendVerificationOTP({ email, otp, type }) {
          await sendEmail(config, otpEmail(email, otp, type === 'forget-password'))
        },
      }),
    ],
    // Do not emit authentication payloads or database errors to Worker logs.
    logger: { disabled: true },
    telemetry: { enabled: false },
  })
}
export type Auth = ReturnType<typeof createAuth>
