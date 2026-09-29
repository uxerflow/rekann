import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ScrollArea } from '../../components/scroll-area'
import { Field } from '../../components/ui'
import { spring } from '../../lib/motion'
import './dashboard-assistant.css'

type Stage = 'thinking' | 'answer' | 'draft' | 'completed' | 'cancelled'
type Topic = 'attendance' | 'availability' | 'approvals' | 'attention' | 'policy' | 'unsupported'
type Turn = { id: number; prompt: string; topic: Topic; stage: Stage; policy?: Policy }
type Policy = {
  name: string
  category: string
  coverage: string
  allowance: string
  approval: string
  payment: string
}
const initialPolicy: Policy = {
  name: 'Maternity leave',
  category: 'Parental leave',
  coverage: 'Female employees',
  allowance: '90',
  approval: 'Department Manager',
  payment: 'Fully Paid',
}
const prompts = [
  'What needs my attention today',
  'Who is off this week',
  'Summarize attendance this month',
  'Show pending approvals',
]
const contexts = [
  'All data',
  'People',
  'Department and teams',
  'Attendance',
  'Leaves',
  'Permissions',
  'Daily reports',
  'Projects',
]
function topicOf(prompt: string): Topic {
  if (/policy|policies/i.test(prompt)) return 'policy'
  if (/late|attendance/i.test(prompt)) return 'attendance'
  if (/off|availability/i.test(prompt)) return 'availability'
  if (/approval/i.test(prompt)) return 'approvals'
  if (/attention/i.test(prompt)) return 'attention'
  return 'unsupported'
}
const Icon = ({ name }: { name: string }) => <img src={`/dashboard/${name}.svg`} alt="" />

// Local preview only: no model requests, uploads, or workspace mutations.
export function DashboardAssistant({
  open,
  expanded,
  onExpand,
  onClose,
}: {
  open: boolean
  expanded: boolean
  onExpand: () => void
  onClose: () => void
}) {
  const demo = import.meta.env.DEV
  const [turns, setTurns] = useState<Turn[]>([])
  const [message, setMessage] = useState('')
  const [menu, setMenu] = useState<'provider' | 'context' | null>(null)
  const [context, setContext] = useState('All data')
  const [notice, setNotice] = useState('')
  const [edit, setEdit] = useState<Policy | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [attachments, setAttachments] = useState<string[]>([])
  const [showSteps, setShowSteps] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const footer = useRef<HTMLElement>(null)
  const providerTrigger = useRef<HTMLButtonElement>(null)
  const contextTrigger = useRef<HTMLButtonElement>(null)
  const counter = useRef(0)
  const pending = turns.some((t) => t.stage === 'thinking')
  const [fixedPreview, setFixedPreview] = useState(false)

  useEffect(() => {
    if (!demo) return
    const preview = new URLSearchParams(location.search).get('assistantPreview')
    if (preview === 'provider' || preview === 'context') setMenu(preview)
    if (preview && ['thinking', 'chat', 'review', 'completed'].includes(preview)) {
      const topic = preview === 'review' || preview === 'completed' ? 'policy' : 'attendance'
      setTurns([
        {
          id: ++counter.current,
          prompt:
            topic === 'policy'
              ? 'Draft a maternity leave policy.'
              : 'Why are late arrivals increasing?',
          topic,
          stage:
            preview === 'chat' ? 'answer' : preview === 'review' ? 'draft' : (preview as Stage),
        },
      ])
      setFixedPreview(preview === 'thinking')
    }
  }, [demo])
  useEffect(() => {
    if (!pending || fixedPreview) return
    const timer = window.setTimeout(
      () =>
        setTurns((current) =>
          current.map((t) =>
            t.stage === 'thinking' ? { ...t, stage: t.topic === 'policy' ? 'draft' : 'answer' } : t,
          ),
        ),
      900,
    )
    return () => window.clearTimeout(timer)
  }, [pending, fixedPreview])
  const editing = edit !== null
  useEffect(() => {
    const viewport = content.current?.querySelector<HTMLElement>('.scroll-viewport')
    if (viewport) viewport.scrollTop = viewport.scrollHeight
  }, [turns.length, pending, editing])
  useEffect(() => {
    if (editing)
      content.current?.querySelector<HTMLInputElement>('.assistant-policy-edit input')?.focus()
  }, [editing])
  const previouslyOpen = useRef(open)
  useEffect(() => {
    if (previouslyOpen.current && !open) setMenu(null)
    previouslyOpen.current = open
  }, [open])
  useEffect(() => {
    if (!menu) return
    function outside(e: PointerEvent) {
      if (!footer.current?.contains(e.target as Node)) setMenu(null)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [menu])
  function closeMenu() {
    ;(menu === 'provider' ? providerTrigger : contextTrigger).current?.focus()
    setMenu(null)
  }
  function send(prompt: string) {
    const value = prompt.trim()
    if (!value || pending) return
    if (!demo) {
      setNotice('Assistant responses are not available yet.')
      return
    }
    setFixedPreview(false)
    setMenu(null)
    setNotice('')
    setMessage('')
    setAttachments([])
    setTurns((current) => [
      ...current,
      {
        id: ++counter.current,
        prompt: value.slice(0, 2000),
        topic: topicOf(value),
        stage: 'thinking',
      },
    ])
  }
  function changeStage(id: number, stage: Stage) {
    if (stage === 'cancelled' && editingId === id) cancelEdit()
    setTurns((current) => current.map((t) => (t.id === id ? { ...t, stage } : t)))
  }
  function startEdit(id: number) {
    setEditingId(id)
    setEdit({ ...(turns.find((turn) => turn.id === id)?.policy || initialPolicy) })
  }
  function cancelEdit() {
    setEdit(null)
    setEditingId(null)
    composer.current?.focus({ preventScroll: true })
  }
  const validPolicy =
    edit &&
    Object.values(edit).every((v) => v.trim()) &&
    /^\d{1,3}$/.test(edit.allowance) &&
    Number(edit.allowance) > 0 &&
    Number(edit.allowance) <= 365

  return (
    <div
      className="assistant-panel"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && (menu || edit)) {
          e.preventDefault()
          e.stopPropagation()
          if (menu) closeMenu()
          else cancelEdit()
        }
      }}
    >
      <header>
        <h2 id="assistant-title">Assistant</h2>
        <div className="assistant-header-actions">
          {turns.length > 0 && (
            <button
              className="icon-button"
              aria-label="New conversation"
              onClick={() => {
                setTurns([])
                cancelEdit()
                setNotice('')
                setMessage('')
                setAttachments([])
                composer.current?.focus()
              }}
            >
              <Icon name="assistant-add" />
            </button>
          )}
          <button
            className="icon-button assistant-expand"
            aria-label={expanded ? 'Restore Assistant' : 'Expand Assistant'}
            aria-pressed={expanded}
            onClick={onExpand}
          >
            <Icon name="assistant-expand" />
          </button>
          <button
            className="icon-button assistant-close"
            aria-label="Close Assistant"
            onClick={onClose}
          >
            <img
              className="assistant-desktop-close"
              src="/dashboard/assistant-collapse.svg"
              alt=""
            />
            <img className="assistant-mobile-close" src="/dashboard/close.svg" alt="" />
          </button>
        </div>
      </header>
      <div className="assistant-scroll-host" ref={content}>
        <ScrollArea className="assistant-content">
          {!turns.length ? (
            <div className="assistant-start">
              <img src="/dashboard/assistant-logo.svg" width="32" height="32" alt="" />
              <h3>Rekann Assistant</h3>
              <p>Ask questions about your team and manage everyday HR tasks.</p>
              <div>
                {prompts.map((prompt) => (
                  <button key={prompt} onClick={() => send(prompt)}>
                    <img src="/dashboard/assistant-prompt.svg" width="20" height="24" alt="" />
                    <span>{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="assistant-conversation" aria-label="Conversation">
              {turns.map((turn) => {
                const policy = turn.policy || initialPolicy
                return (
                  <section className="assistant-turn" key={turn.id}>
                    <div className="assistant-question">{turn.prompt}</div>
                    <div
                      className="assistant-answer"
                      aria-live="polite"
                      aria-busy={turn.stage === 'thinking'}
                    >
                      {turn.stage === 'thinking' ? (
                        <div className="assistant-thinking" role="status" aria-label="Thinking">
                          <span className="assistant-thinking-dot" />
                          <span>Thinking...</span>
                        </div>
                      ) : (
                        <>
                          <button
                            className="assistant-worked"
                            disabled={turn.stage !== 'completed'}
                            onClick={() => setShowSteps(!showSteps)}
                            aria-expanded={turn.stage === 'completed' ? showSteps : undefined}
                          >
                            <Icon name="assistant-worked" />
                            {turn.stage === 'completed'
                              ? 'Finished in 5 steps'
                              : 'Worked for 15 seconds'}
                            {turn.stage === 'completed' && <Icon name="row-chevron" />}
                          </button>
                          {turn.stage === 'cancelled' ? (
                            <p>Draft cancelled. No changes were saved.</p>
                          ) : turn.stage === 'completed' ? (
                            <>
                              {showSteps && (
                                <ol className="assistant-steps">
                                  <li>Read the request</li>
                                  <li>Prepared the draft</li>
                                  <li>Reviewed the details</li>
                                  <li>Confirmed the policy</li>
                                  <li>Completed the preview</li>
                                </ol>
                              )}
                              <div className="assistant-success">
                                <p>
                                  Leave policy created successfully{' '}
                                  <mark>
                                    <i />
                                    {policy.name}
                                  </mark>{' '}
                                  has been added to <mark>Custom leave policy</mark>
                                </p>
                                <p>You can review and edit the policy in leave settings.</p>
                              </div>
                              <p>Review {policy.name.toLowerCase()} policy</p>
                              <button
                                className="dashboard-small-button assistant-view-policy"
                                onClick={() => startEdit(turn.id)}
                              >
                                View leave policy <Icon name="row-chevron" />
                              </button>
                            </>
                          ) : turn.stage === 'draft' ? (
                            <>
                              <p>
                                I’ve prepared a draft based on common policies and your current
                                setup.
                              </p>
                              <div className="assistant-result-card assistant-policy-card">
                                <div>
                                  <h3>{policy.name} (draft)</h3>
                                  <p className="assistant-caption">
                                    Review {policy.name.toLowerCase()} details before adding them to
                                    the leave policy.
                                  </p>
                                </div>
                                <hr />
                                <dl>
                                  {[
                                    ['Category', policy.category],
                                    ['Coverage', policy.coverage],
                                    ['Allowance', `${policy.allowance} calendar days / year`],
                                    ['Approval', policy.approval],
                                    ['Payment', policy.payment],
                                  ].map(([label, value]) => (
                                    <div key={label}>
                                      <dt>{label}</dt>
                                      <dd>{value}</dd>
                                    </div>
                                  ))}
                                </dl>
                                <p className="assistant-warning">
                                  Review this draft in leave settings before creating the policy.
                                </p>
                                <hr />
                                <div className="assistant-draft-actions">
                                  <button
                                    className="dashboard-small-button assistant-primary"
                                    onClick={() => startEdit(turn.id)}
                                  >
                                    Create leave policy
                                  </button>
                                  <button
                                    className="dashboard-small-button"
                                    onClick={() => startEdit(turn.id)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="dashboard-small-button"
                                    onClick={() => changeStage(turn.id, 'cancelled')}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </>
                          ) : turn.topic === 'attendance' ? (
                            <AttendanceAnswer
                              onView={() =>
                                setNotice(
                                  'Attendance records are not connected yet. These results use sample data.',
                                )
                              }
                            />
                          ) : (
                            <SimpleAnswer
                              topic={turn.topic}
                              onDraft={() => send('Draft a maternity leave policy.')}
                            />
                          )}
                        </>
                      )}
                    </div>
                  </section>
                )
              })}
              {edit && (
                <form
                  className="assistant-result-card assistant-policy-edit"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!validPolicy || editingId === null) return
                    setTurns((current) =>
                      current.map((turn) =>
                        turn.id === editingId
                          ? {
                              ...turn,
                              stage: 'completed',
                              policy: { ...edit, name: edit.name.trim() },
                            }
                          : turn,
                      ),
                    )
                    cancelEdit()
                  }}
                >
                  <h3>Review leave policy</h3>
                  <p className="assistant-caption">
                    Preview only. Confirming does not save a policy to your workspace.
                  </p>
                  <Field
                    label="Leave name"
                    required
                    maxLength={60}
                    value={edit.name}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  />
                  {(['category', 'coverage', 'approval', 'payment'] as const).map((key) => (
                    <Field
                      key={key}
                      label={
                        {
                          category: 'Category',
                          coverage: 'Coverage',
                          approval: 'Approval',
                          payment: 'Payment',
                        }[key]
                      }
                      required
                      maxLength={60}
                      value={edit[key]}
                      onChange={(e) => setEdit({ ...edit, [key]: e.target.value })}
                    />
                  ))}
                  <Field
                    label="Allowance (days)"
                    required
                    inputMode="numeric"
                    maxLength={3}
                    value={edit.allowance}
                    onChange={(e) =>
                      setEdit({ ...edit, allowance: e.target.value.replace(/\D/g, '').slice(0, 3) })
                    }
                    hint="Enter a whole number from 1 to 365."
                  />
                  <div className="assistant-draft-actions">
                    <button className="dashboard-small-button" type="button" onClick={cancelEdit}>
                      Cancel
                    </button>
                    <button
                      className="dashboard-small-button assistant-primary"
                      disabled={!validPolicy}
                      type="submit"
                    >
                      Confirm policy
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </ScrollArea>
      </div>
      <footer className="assistant-footer" ref={footer}>
        {notice && (
          <p className="assistant-inline-notice" role="status">
            {notice}
            <button aria-label="Dismiss Assistant message" onClick={() => setNotice('')}>
              <Icon name="close" />
            </button>
          </p>
        )}
        {attachments.length > 0 && (
          <div className="assistant-attachments">
            {attachments.map((name) => (
              <span key={name}>
                {name}
                <button
                  aria-label={`Remove ${name}`}
                  onClick={() => setAttachments((current) => current.filter((n) => n !== name))}
                >
                  <Icon name="close" />
                </button>
              </span>
            ))}
            <small>Local preview · Files are not uploaded</small>
          </div>
        )}
        {context !== 'All data' && (
          <div className="assistant-context-chip">
            {context}
            <button aria-label="Clear context" onClick={() => setContext('All data')}>
              <Icon name="close" />
            </button>
          </div>
        )}
        <form
          className="assistant-composer"
          onSubmit={(e) => {
            e.preventDefault()
            send(message)
          }}
        >
          <textarea
            ref={composer}
            aria-label="Message Assistant"
            placeholder="Ask about your team..."
            rows={1}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send(message)
              }
            }}
          />
          <div className="assistant-composer-actions">
            <div>
              <input
                ref={file}
                type="file"
                hidden
                accept="image/png,image/jpeg,application/pdf"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || [])
                  e.target.value = ''
                  if (
                    files.some(
                      (f) =>
                        !['image/png', 'image/jpeg', 'application/pdf'].includes(f.type) ||
                        f.size > 10 * 1024 * 1024,
                    ) ||
                    files.length + attachments.length > 3
                  ) {
                    setNotice('Choose up to 3 PNG, JPG, or PDF files, no larger than 10 MB each.')
                    return
                  }
                  setAttachments((current) => [
                    ...new Set([...current, ...files.map((f) => f.name)]),
                  ])
                  setNotice('Files stay on this device. File analysis is not connected yet.')
                }}
              />
              <button
                type="button"
                className="icon-button"
                aria-label="Add attachment"
                onClick={() =>
                  demo ? file.current?.click() : setNotice('Attachments are not available yet.')
                }
              >
                <Icon name="assistant-add" />
              </button>
              <button
                ref={contextTrigger}
                type="button"
                className="icon-button"
                aria-label="Add context"
                aria-expanded={menu === 'context'}
                aria-haspopup="menu"
                aria-controls="assistant-context-menu"
                onClick={() => setMenu(menu === 'context' ? null : 'context')}
              >
                <Icon name="assistant-context" />
              </button>
            </div>
            <div>
              <button
                ref={providerTrigger}
                type="button"
                className="assistant-provider"
                aria-label="Select AI provider"
                aria-expanded={menu === 'provider'}
                aria-haspopup="menu"
                aria-controls="assistant-provider-menu"
                onClick={() => setMenu(menu === 'provider' ? null : 'provider')}
              >
                <img src="/dashboard/assistant-logo.svg" width="16" height="16" alt="" />
                <span>Rekann</span>
                <img src="/dashboard/assistant-chevron.svg" width="16" height="16" alt="" />
              </button>
              <button
                type="submit"
                className="icon-button assistant-send"
                aria-label="Send message"
                disabled={pending || !message.trim()}
              >
                <Icon name="assistant-send" />
              </button>
            </div>
          </div>
        </form>
        <AssistantMenu
          kind={menu}
          selected={context}
          onClose={closeMenu}
          onSelect={(value) => {
            if (menu === 'context') setContext(value)
            else if (value === 'Connect AI provider')
              setNotice(
                'AI provider setup will be available in Settings. This preview uses sample responses.',
              )
            closeMenu()
          }}
        />
        <small
          title={
            demo
              ? 'Local preview: sample responses and simulated actions. No AI provider or workspace writes.'
              : undefined
          }
        >
          AI can make mistakes. Always verify important information.
        </small>
      </footer>
    </div>
  )
}

function AttendanceAnswer({ onView }: { onView: () => void }) {
  return (
    <>
      <p>Late arrivals increased by 40% compared to last week.</p>
      <p>
        Most late arrivals occurred within this 15-minute buffer past standard 09:00 clock-in. Peak
        Arrival Window between 09:10 – 09:25.
      </p>
      <div className="assistant-result-card assistant-attendance-result">
        <h3>Late arrivals by department</h3>
        <hr />
        <div className="assistant-bars">
          {[
            ['Design', 70, 7],
            ['Operations', 20, 2],
            ['Management', 10, 1],
          ].map(([name, percent, total]) => (
            <div key={name}>
              <div>
                <span>{name}</span>
                <span>
                  {percent}% of total {total}
                </span>
              </div>
              <div className="assistant-bar">
                <i style={{ width: `${percent}%` }} />
              </div>
            </div>
          ))}
        </div>
        <hr />
        <button className="dashboard-small-button" onClick={onView}>
          View attendance records <Icon name="row-chevron" />
        </button>
      </div>
      <div className="assistant-insight">
        <h3>Insights</h3>
        <p>
          Attendance records show when employees arrived, but do not explain why. Review the records
          before following up.
        </p>
      </div>
    </>
  )
}
function SimpleAnswer({ topic, onDraft }: { topic: Topic; onDraft: () => void }) {
  if (topic === 'availability')
    return (
      <>
        <p>4 employees are off this week.</p>
        <div className="assistant-result-card">
          <h3>Team availability</h3>
          {['Oliver Bennett', 'Lucas Martin', 'Emma Wilson', 'Sophie Laurent'].map((name, i) => (
            <div className="assistant-person" key={name}>
              <img src={`/dashboard/avatar-${i}.svg`} width="36" height="36" alt="" />
              <span>
                {name}
                <small>
                  {['9–10 Feb 2026', '9 Feb 2026', '9–11 Feb 2026', '8–10 Feb 2026'][i]}
                </small>
              </span>
            </div>
          ))}
        </div>
      </>
    )
  if (topic === 'unsupported')
    return (
      <>
        <p>
          This preview supports attendance, team availability, pending approvals, and a sample leave
          policy.
        </p>
        <button className="dashboard-small-button" onClick={onDraft}>
          Draft a maternity leave policy
        </button>
      </>
    )
  return (
    <>
      <p>
        {topic === 'approvals'
          ? '8 requests are awaiting a decision.'
          : 'Here is what needs your attention today.'}
      </p>
      <div className="assistant-result-card">
        <h3>Pending requests</h3>
        <p>4 time-off requests</p>
        <p>4 permission requests</p>
        {topic === 'attention' && (
          <>
            <hr />
            <p>4 attendance records need review.</p>
            <p>2 new employees don’t have a mentor.</p>
          </>
        )}
      </div>
      <button className="dashboard-small-button" onClick={onDraft}>
        Draft a maternity leave policy
      </button>
    </>
  )
}

function AssistantMenu({
  kind,
  selected,
  onClose,
  onSelect,
}: {
  kind: 'provider' | 'context' | null
  selected: string
  onClose: () => void
  onSelect: (value: string) => void
}) {
  const reduce = useReducedMotion()
  const root = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    if (kind) {
      setActive(null)
      root.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    }
  }, [kind])
  const items = kind === 'context' ? contexts : ['Rekann', 'Connect AI provider']
  return (
    <AnimatePresence>
      {kind && (
        <motion.div
          ref={root}
          id={`assistant-${kind}-menu`}
          className={`assistant-menu assistant-menu-${kind}`}
          role="menu"
          aria-label={kind === 'context' ? 'Workspace context' : 'AI provider'}
          initial={reduce ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.12 } }}
          transition={reduce ? { duration: 0 } : spring.moderate}
          onMouseLeave={() => setActive(null)}
          onKeyDown={(e) => {
            const buttons = Array.from(
              root.current?.querySelectorAll<HTMLButtonElement>('button') || [],
            )
            const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
              e.preventDefault()
              const next =
                e.key === 'Home'
                  ? 0
                  : e.key === 'End'
                    ? buttons.length - 1
                    : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
              buttons[next]?.focus()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              onClose()
            }
            if (e.key === 'Tab') onClose()
          }}
        >
          <ScrollArea className="assistant-menu-scroll">
            {items.map((item, i) => (
              <div key={item}>
                {i > 0 && (kind === 'provider' || [1, 3, 6].includes(i)) && <hr />}
                {kind === 'provider' && i === 1 && (
                  <div className="assistant-menu-label">YOUR AI PROVIDER</div>
                )}
                <button
                  role={item === 'Connect AI provider' ? 'menuitem' : 'menuitemradio'}
                  aria-checked={
                    item === 'Connect AI provider'
                      ? undefined
                      : kind === 'provider' || item === selected
                  }
                  onPointerEnter={() => setActive(item)}
                  onFocus={() => setActive(item)}
                  onClick={() => onSelect(item)}
                >
                  {active === item && (
                    <motion.span
                      className="assistant-menu-hover"
                      layoutId={`assistant-${kind}-hover`}
                      transition={reduce ? { duration: 0 } : spring.fast}
                    />
                  )}
                  {kind === 'provider' && (
                    <Icon name={i === 0 ? 'assistant-logo' : 'assistant-add'} />
                  )}
                  <span className="assistant-menu-item-text">
                    {item}
                    {kind === 'context' && i === 0 && (
                      <small>Use all company data you have access to</small>
                    )}
                  </span>
                  {((kind === 'provider' && i === 0) ||
                    (kind === 'context' && item === selected)) && (
                    <span className="assistant-menu-check" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
              </div>
            ))}
          </ScrollArea>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
