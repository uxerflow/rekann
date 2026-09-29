import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { ArrowRight } from 'lucide-react'
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'framer-motion'
import { spring } from '../../lib/motion'
import { ScrollArea } from '../../components/scroll-area'
import { followUrl, updates, type Update } from './updates'
import type { Result } from './waitlist'
function Follow({ dark = false }: { dark?: boolean }) {
  return (
    <a
      className={`wl-button wl-follow ${dark ? 'wl-dark-button' : ''}`}
      href={followUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      <img src="/waitlist/x.svg" alt="" width="16" height="16" />
      Follow on X
    </a>
  )
}
function Modal({
  children,
  className = '',
  onClose,
  titleId,
  returnFocus,
}: {
  children: ReactNode | ((close: () => void) => ReactNode)
  className?: string
  onClose: () => void
  titleId: string
  returnFocus?: RefObject<HTMLButtonElement | null>
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const closing = useRef(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  function close() {
    if (closing.current) return
    closing.current = true
    const dialog = ref.current
    if (!dialog || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose()
      return
    }
    dialog.dataset.closing = 'true'
    closeTimer.current = setTimeout(onClose, spring.slow.exit.duration * 1000)
  }
  useEffect(() => {
    const previouslyFocused = returnFocus?.current || (document.activeElement as HTMLElement | null)
    const dialog = ref.current
    dialog?.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(closeTimer.current)
      dialog?.close()
      document.body.style.overflow = overflow
      previouslyFocused?.focus()
    }
  }, [])
  return (
    <dialog
      ref={ref}
      className={`wl-dialog ${className}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect()
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close()
        }
      }}
    >
      <button className="wl-close" type="button" aria-label="Close dialog" onClick={close}>
        <img src="/waitlist/close.svg" width="24" height="24" alt="" />
      </button>
      {typeof children === 'function' ? children(close) : children}
    </dialog>
  )
}
function Confirmation({
  result,
  onClose,
  returnFocus,
}: {
  result: Result
  onClose: () => void
  returnFocus: RefObject<HTMLButtonElement | null>
}) {
  return (
    <Modal
      className="wl-confirm"
      titleId="wl-confirm-title"
      onClose={onClose}
      returnFocus={returnFocus}
    >
      <img className="wl-check" src="/waitlist/check.svg" alt="" width="96" height="96" />
      <div>
        <h2 id="wl-confirm-title">
          {result === 'joined'
            ? 'Added to the waitlist.'
            : result === 'already'
              ? 'You’re already on the list.'
              : 'Your preferences are saved.'}
        </h2>
        <p>
          {result === 'joined'
            ? 'We’ll let you know when Rekann is ready for your team.'
            : result === 'already'
              ? 'You’re all set. We’ll email you when Rekann is ready.'
              : 'You previously unsubscribed. We haven’t turned emails back on.'}
        </p>
      </div>
      <div className="wl-confirm-follow">
        <p>Follow our progress</p>
        <Follow />
      </div>
    </Modal>
  )
}
function Preview({ post }: { post: Update }) {
  return (
    <div className={`wl-post-image wl-post-image-${post.id}`}>
      <img
        src={post.image}
        alt={
          post.id === 'dashboard'
            ? 'Rekann dashboard showing attendance, team requests and the AI assistant'
            : 'Rekann profile setup during onboarding'
        }
        width={post.width}
        height={post.height}
      />
    </div>
  )
}
function UpdateDetail({ post, onClose }: { post: Update; onClose: () => void }) {
  return (
    <Modal className="wl-article" titleId="wl-article-title" onClose={onClose}>
      {(close) => (
        <ScrollArea className="wl-article-scroll">
          <article>
            <div className="wl-article-header">
              <img src="/waitlist/news.svg" width="20" height="20" alt="" />
              Product update
            </div>
            <Preview post={post} />
            <div className="wl-article-copy">
              <p className="wl-meta">{post.meta}</p>
              <h2 id="wl-article-title">{post.title}</h2>
              <p>{post.body}</p>
            </div>
            <p className="wl-article-note">{post.note}</p>
            <div className="wl-article-actions">
              <button type="button" className="wl-button wl-dark-button" onClick={close}>
                Back to updates
              </button>
              <Follow dark />
            </div>
          </article>
        </ScrollArea>
      )}
    </Modal>
  )
}
function UpdatesPanel({
  children,
  panelRef,
}: {
  children: ReactNode
  panelRef: RefObject<HTMLElement | null>
}) {
  const present = useIsPresent()
  const reduceMotion = useReducedMotion()
  return (
    <motion.aside
      ref={panelRef}
      id="wl-updates"
      className="wl-updates"
      aria-labelledby="wl-updates-title"
      inert={!present}
      initial={{ opacity: 0, y: reduceMotion ? 0 : -8, scale: reduceMotion ? 1 : 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{
        opacity: 0,
        y: reduceMotion ? 0 : -4,
        transition: { duration: reduceMotion ? 0 : spring.slow.exit.duration },
      }}
      transition={reduceMotion ? { duration: 0 } : spring.slow}
    >
      {children}
    </motion.aside>
  )
}
export default function WaitlistOverlays({
  feed,
  setFeed,
  result,
  setResult,
  launcher,
  submitButton,
}: {
  feed: boolean
  setFeed: (value: boolean) => void
  result: Result | null
  setResult: (value: Result | null) => void
  launcher: RefObject<HTMLButtonElement | null>
  submitButton: RefObject<HTMLButtonElement | null>
}) {
  const [post, setPost] = useState<Update | null>(null)
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!feed || post) return
    const first = panel.current?.querySelector<HTMLButtonElement>('button')
    first?.focus()
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setFeed(false)
        launcher.current?.focus()
      }
    }
    function outside(e: PointerEvent) {
      if (
        !panel.current?.contains(e.target as Node) &&
        !launcher.current?.contains(e.target as Node)
      )
        setFeed(false)
    }
    document.addEventListener('keydown', key)
    document.addEventListener('pointerdown', outside)
    return () => {
      document.removeEventListener('keydown', key)
      document.removeEventListener('pointerdown', outside)
    }
  }, [feed, post])
  return (
    <>
      <AnimatePresence>
        {feed && (
          <UpdatesPanel key="updates" panelRef={panel}>
            <div className="wl-feed-heading">
              <div>
                <h2 id="wl-updates-title">Updates</h2>
                <button
                  type="button"
                  className="wl-close"
                  aria-label="Close updates"
                  onClick={() => {
                    setFeed(false)
                    launcher.current?.focus()
                  }}
                >
                  <img src="/waitlist/close.svg" width="24" height="24" alt="" />
                </button>
              </div>
              <p>A look at what we’re building for your team.</p>
            </div>
            <ScrollArea className="wl-feed-scroll">
              <div className="wl-posts">
                {updates.map((item) => (
                  <article className="wl-card" key={item.id}>
                    <Preview post={item} />
                    <p className="wl-meta">{item.meta}</p>
                    <h3>{item.title}</h3>
                    <p>{item.summary}</p>
                    <button type="button" className="wl-read" onClick={() => setPost(item)}>
                      Read update
                      <ArrowRight size={16} />
                      <span className="sr-only">: {item.title}</span>
                    </button>
                  </article>
                ))}
              </div>
            </ScrollArea>
          </UpdatesPanel>
        )}
      </AnimatePresence>
      {result && (
        <Confirmation result={result} onClose={() => setResult(null)} returnFocus={submitButton} />
      )}
      {post && <UpdateDetail post={post} onClose={() => setPost(null)} />}
    </>
  )
}
