import { and, eq, inArray, lte } from 'drizzle-orm'
import type { Database } from './db'
import type { AppConfig } from './config'
import { waitlistSubscriber } from './schema'
import { AppError } from './workspaces'
import { escapeHtml, sendEmail } from './email'
import { subscribeInput, unsubscribeToken, verifyUnsubscribe } from './waitlist-security'

export async function subscribe(db: Database, value: unknown) {
  const input = subscribeInput.parse(value)
  if (input.website) return { result: 'joined' as const }
  const [created] = await db
    .insert(waitlistSubscriber)
    .values({ id: crypto.randomUUID(), email: input.email })
    .onConflictDoNothing({ target: waitlistSubscriber.email })
    .returning({ id: waitlistSubscriber.id })
  if (created) return { result: 'joined' as const }
  const [existing] = await db
    .select({ status: waitlistSubscriber.status })
    .from(waitlistSubscriber)
    .where(eq(waitlistSubscriber.email, input.email))
  // A repeated form submission must never override an unsubscribe or a complaint.
  return {
    result: existing?.status === 'subscribed' ? ('already' as const) : ('unsubscribed' as const),
  }
}
export async function unsubscribe(db: Database, token: string, secret: string) {
  const id = await verifyUnsubscribe(token, secret)
  if (!id)
    throw new AppError(400, 'This unsubscribe link is invalid. Please use the link in your email.')
  await db
    .update(waitlistSubscriber)
    .set({
      status: 'unsubscribed',
      unsubscribedAt: new Date(),
      syncPending: true,
      syncAttempts: 0,
      nextSyncAt: new Date(),
    })
    .where(and(eq(waitlistSubscriber.id, id), eq(waitlistSubscriber.status, 'subscribed')))
  return { unsubscribed: true }
}
export async function suppress(
  db: Database,
  emails: string[],
  status: 'unsubscribed' | 'suppressed',
) {
  if (!emails.length) return
  await db
    .update(waitlistSubscriber)
    .set({
      status,
      unsubscribedAt: new Date(),
      syncPending: true,
      syncAttempts: 0,
      nextSyncAt: new Date(),
    })
    .where(
      and(
        inArray(
          waitlistSubscriber.email,
          emails.map((e) => e.trim().toLowerCase()),
        ),
        eq(waitlistSubscriber.status, 'subscribed'),
      ),
    )
}
async function resend(
  config: AppConfig,
  path: string,
  method = 'GET',
  body?: unknown,
  sending = false,
  idempotency?: string,
) {
  const apiKey = sending
    ? config.RESEND_API_KEY
    : config.RESEND_CONTACTS_API_KEY || config.RESEND_API_KEY
  if (!apiKey) throw new Error('Waitlist email integration is not configured.')
  await new Promise((resolve) => setTimeout(resolve, 600))
  const response = await fetch(`https://api.resend.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      ...(idempotency ? { 'Idempotency-Key': idempotency } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  })
  if (method === 'GET' && response.status === 404) return null
  if (!response.ok) throw new Error(`Waitlist provider request failed (${response.status}).`)
  return response.json() as Promise<{ id: string; unsubscribed?: boolean }>
}
export function welcomeEmail(email: string, url: string) {
  return {
    to: email,
    subject: 'You’re on the Rekann waitlist',
    text: `Thanks for joining the Rekann waitlist. We’ll let you know when Rekann is ready for your team.\n\nFollow our progress: https://x.com/rekannapp\n\nUnsubscribe: ${url}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:40px auto;color:#292929"><p style="color:#15835f;font-weight:600">Rekann</p><h1 style="font-size:24px">You’re on the list.</h1><p>We’ll let you know when Rekann is ready for your team.</p><p><a href="https://x.com/rekannapp">Follow our progress on X</a></p><p style="font-size:12px;color:#707070">Changed your mind? <a href="${escapeHtml(url)}">Unsubscribe</a> anytime.</p></div>`,
  }
}
// Durable queue lives on the subscriber row. A cron retry survives provider outages and
// Worker restarts. The row lock serializes delivery with unsubscribe and concurrent jobs.
export async function processWaitlist(db: Database, config: AppConfig, limit = 3) {
  const pending = await db
    .select({ id: waitlistSubscriber.id })
    .from(waitlistSubscriber)
    .where(
      and(eq(waitlistSubscriber.syncPending, true), lte(waitlistSubscriber.nextSyncAt, new Date())),
    )
    .orderBy(waitlistSubscriber.nextSyncAt)
    .limit(limit)
  for (const item of pending) {
    try {
      await db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(waitlistSubscriber)
          .where(
            and(
              eq(waitlistSubscriber.id, item.id),
              eq(waitlistSubscriber.syncPending, true),
              lte(waitlistSubscriber.nextSyncAt, new Date()),
            ),
          )
          .for('update', { skipLocked: true })
        if (!row) return
        let subscribed = row.status === 'subscribed'
        if (config.EMAIL_DELIVERY !== 'local') {
          if (!config.RESEND_WAITLIST_SEGMENT_ID)
            throw new Error('Waitlist segment is not configured.')
          const contactPath = `/contacts/${encodeURIComponent(row.email)}`
          let contact = await resend(config, contactPath)
          // Never write unsubscribed:false to an existing contact.
          if (!contact && subscribed)
            contact = await resend(config, '/contacts', 'POST', {
              email: row.email,
              segments: [{ id: config.RESEND_WAITLIST_SEGMENT_ID }],
            })
          else if (contact && !subscribed)
            await resend(config, contactPath, 'PATCH', { unsubscribed: true })
          else if (contact?.unsubscribed) {
            subscribed = false
            await tx
              .update(waitlistSubscriber)
              .set({ status: 'unsubscribed', unsubscribedAt: new Date() })
              .where(eq(waitlistSubscriber.id, row.id))
          } else if (contact) {
            await resend(
              config,
              `${contactPath}/segments/${config.RESEND_WAITLIST_SEGMENT_ID}`,
              'POST',
            )
          }
        }
        // Resend idempotency lasts 24h. Do not retry welcome sends outside that window.
        // Signup itself remains valid even if a welcome email cannot be delivered.
        if (
          subscribed &&
          !row.welcomeSentAt &&
          Date.now() - row.createdAt.getTime() < 23 * 3600_000
        ) {
          const secret =
            config.WAITLIST_TOKEN_SECRET ||
            (config.APP_ENV === 'local' ? config.BETTER_AUTH_SECRET : '')
          if (!secret) throw new Error('Waitlist token signing is not configured.')
          const token = await unsubscribeToken(row.id, secret)
          const url = new URL('/unsubscribe', config.WAITLIST_URL)
          url.searchParams.set('token', token)
          const email = welcomeEmail(row.email, url.href)
          if (config.EMAIL_DELIVERY === 'local') await sendEmail(config, email)
          else
            await resend(
              config,
              '/emails',
              'POST',
              {
                ...email,
                from: config.EMAIL_FROM,
                to: [email.to],
                headers: {
                  'List-Unsubscribe': `<${new URL(`/api/waitlist/unsubscribe?token=${encodeURIComponent(token)}`, config.WAITLIST_URL)}>`,
                  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                },
              },
              true,
              `waitlist-welcome/${row.id}`,
            )
          await tx
            .update(waitlistSubscriber)
            .set({ welcomeSentAt: new Date() })
            .where(eq(waitlistSubscriber.id, row.id))
        }
        await tx
          .update(waitlistSubscriber)
          .set({ syncPending: false, syncedAt: new Date(), syncAttempts: 0 })
          .where(eq(waitlistSubscriber.id, row.id))
      })
    } catch {
      // Provider responses and addresses deliberately never enter logs.
      const [row] = await db
        .select({ attempts: waitlistSubscriber.syncAttempts })
        .from(waitlistSubscriber)
        .where(eq(waitlistSubscriber.id, item.id))
      await db
        .update(waitlistSubscriber)
        .set({
          syncAttempts: (row?.attempts || 0) + 1,
          nextSyncAt: new Date(
            Date.now() + Math.min(3600_000, 60_000 * 2 ** Math.min(row?.attempts || 0, 6)),
          ),
        })
        .where(eq(waitlistSubscriber.id, item.id))
      console.error('Waitlist delivery deferred; the persisted job will retry.')
      break
    }
  }
}
