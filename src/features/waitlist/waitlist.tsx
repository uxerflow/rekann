import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { LoaderCircle } from 'lucide-react'
import { useHydrated } from '../../components/ui'
import './waitlist.css'

export type Result = 'joined' | 'already' | 'unsubscribed'
const loadOverlays = () => import('./overlays')
const WaitlistOverlays = lazy(loadOverlays)

export function Waitlist() {
  const hydrated = useHydrated()
  const [previewReady, setPreviewReady] = useState(false)
  const product = useRef<HTMLElement>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [feed, setFeed] = useState(false)
  const [overlaysRequested, setOverlaysRequested] = useState(false)
  const launcher = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const submitButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    let active = true
    const images = Array.from(product.current?.querySelectorAll('img') ?? [])
    void Promise.all(
      images.map((image) =>
        image.decode().catch(() => {
          if (active) image.hidden = true
        }),
      ),
    ).then(() => {
      if (active) setPreviewReady(true)
    })
    return () => {
      active = false
    }
  }, [])
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    void loadOverlays().catch(() => {})
    setError('')
    setBusy(true)
    const form = new FormData(e.currentTarget)
    try {
      const response = await fetch('/api/waitlist/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, website: form.get('website') }),
        signal: AbortSignal.timeout(15_000),
      })
      const data = (await response.json()) as { result?: Result; error?: string }
      if (!response.ok || !data.result)
        throw new Error(data.error || 'We couldn’t save your email. Please try again.')
      setOverlaysRequested(true)
      setResult(data.result)
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name !== 'TimeoutError'
          ? cause.message
          : 'This is taking longer than expected. Please try again.',
      )
      input.current?.focus()
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="wl-page">
      <header className="wl-header">
        <a href="/" aria-label="Rekann home">
          <img src="/waitlist/logo.svg" alt="Rekann" width="144" height="32" />
        </a>
        <button
          className="wl-button wl-dark-button wl-launcher"
          ref={launcher}
          type="button"
          aria-expanded={feed}
          aria-controls="wl-updates"
          onPointerEnter={() => {
            void loadOverlays().catch(() => {})
          }}
          onFocus={() => {
            void loadOverlays().catch(() => {})
          }}
          onClick={() => {
            setOverlaysRequested(true)
            setFeed(!feed)
          }}
        >
          <img src="/waitlist/news.svg" width="16" height="16" alt="" />
          See updates
        </button>
      </header>
      <section className="wl-hero" aria-labelledby="wl-heading">
        <h1 id="wl-heading">
          <span>
            Everything your
            <br className="wl-mobile-break" /> team needs.
          </span>
          <span>One HR workspace.</span>
        </h1>
        <p className="wl-description">
          Bring your people, attendance and time off together,
          <br className="wl-desktop-break" /> with an AI assistant to make everyday HR easier.
        </p>
        <form className="wl-signup" onSubmit={submit}>
          <div className="wl-form-row">
            <label className="wl-email">
              <span className="sr-only">Email address</span>
              <img src="/icons/mail.svg" alt="" width="16" height="16" />
              <input
                ref={input}
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={254}
                disabled={busy}
                aria-invalid={!!error}
                aria-describedby={error ? 'wl-error' : 'wl-promise'}
              />
            </label>
            <button
              className="wl-button wl-primary"
              ref={submitButton}
              type="submit"
              disabled={busy || !hydrated}
              aria-busy={busy}
            >
              {busy && <LoaderCircle size={16} className="wl-spinner" />}
              {busy ? 'Joining…' : 'Join the waitlist'}
            </button>
          </div>
          <div className="wl-honeypot" aria-hidden="true">
            <label>
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          {error && (
            <p className="wl-error" id="wl-error" role="alert">
              {error}
            </p>
          )}
          <p id="wl-promise" className="wl-promise">
            Be first to hear when Rekann is ready.
            <br className="wl-mobile-break" /> Unsubscribe anytime.
          </p>
        </form>
      </section>
      <div className="wl-features" aria-label="Coming to Rekann">
        {[
          ['ai', 'AI Assistant', 128],
          ['team', 'Team directory', 152],
          ['attendance-label', 'Attendance', 120],
          ['timeoff', 'Time off', 104],
        ].map(([src, alt, width]) => (
          <img
            key={src}
            src={`/waitlist/${src}.svg`}
            alt={String(alt)}
            width={Number(width)}
            height="32"
          />
        ))}
      </div>
      <noscript>
        <style>{'.wl-product[data-ready="false"] { visibility: visible; }'}</style>
      </noscript>
      <section
        className="wl-product"
        ref={product}
        data-ready={previewReady}
        aria-label="A preview of the Rekann workspace"
      >
        <div className="wl-dashboard">
          <img
            src="/waitlist/dashboard.webp"
            alt="A preview of the Rekann dashboard"
            width="1440"
            height="1024"
            fetchPriority="low"
          />
        </div>
        <img
          className="wl-attendance"
          fetchPriority="low"
          src="/waitlist/attendance.svg"
          alt="Present today: 18 of 20"
          width="264"
          height="128"
        />
        <img
          className="wl-assistant"
          fetchPriority="low"
          src="/waitlist/assistant.svg"
          alt="Rekann Assistant: Who is off this week?"
          width="264"
          height="208"
        />
      </section>
      <div className="wl-bottom-fade" />
      {overlaysRequested && (
        <Suspense
          fallback={
            <span className="sr-only" role="status">
              Loading…
            </span>
          }
        >
          <WaitlistOverlays
            feed={feed}
            setFeed={setFeed}
            result={result}
            setResult={setResult}
            launcher={launcher}
            submitButton={submitButton}
          />
        </Suspense>
      )}
    </main>
  )
}
