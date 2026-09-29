import { useHydrated } from '../components/ui'
import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import '../features/waitlist/waitlist.css'

export const Route = createFileRoute('/unsubscribe')({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' && search.token.length <= 128 ? search.token : '',
  }),
  head: () => ({
    meta: [
      { title: 'Email preferences — Rekann' },
      { name: 'robots', content: 'noindex, nofollow' },
      { name: 'referrer', content: 'no-referrer' },
    ],
  }),
  component: Unsubscribe,
})
function Unsubscribe() {
  const hydrated = useHydrated()
  const { token } = Route.useSearch()
  const [done, setDone] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  async function remove() {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/waitlist/unsubscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(15_000),
      })
      const body = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(body.error || 'Please try again shortly.')
      setDone(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Please try again shortly.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="wl-unsubscribe">
      <section className="wl-unsubscribe-card">
        <img src="/brand/rekann.svg" alt="Rekann" width="108" height="24" />
        <h1>
          {done
            ? 'You’re unsubscribed.'
            : token
              ? 'Unsubscribe from Rekann?'
              : 'This link is incomplete.'}
        </h1>
        <p>
          {done
            ? 'You won’t receive waitlist or launch updates. Your Rekann account, if you have one, is unchanged.'
            : token
              ? 'You’ll stop receiving waitlist and launch updates.'
              : 'Open the unsubscribe link from one of our emails.'}
        </p>
        {error && <p role="alert">{error}</p>}
        {!done && token && (
          <button
            type="button"
            className="wl-button wl-primary"
            disabled={busy || !hydrated}
            onClick={remove}
          >
            {busy ? 'Saving…' : 'Unsubscribe'}
          </button>
        )}
        <a href="/">Back to Rekann</a>
      </section>
    </main>
  )
}
