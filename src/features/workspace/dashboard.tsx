import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { ScrollArea } from '../../components/scroll-area'
import type { WorkspaceDetails } from '../../server/workspaces'
import { api, messageOf } from '../../lib/api'
import './dashboard.css'
import { SetupChecklist, WelcomeCard } from './dashboard-setup'

export type DashboardState =
  | 'filled'
  | 'empty'
  | 'loading'
  | 'error'
  | 'setup'
  | 'welcome'
  | 'setup-progress'
  | 'setup-complete'
export const wholeNumber = (value: number) =>
  String(Math.max(0, Math.round(Number.isFinite(value) ? value : 0)))
const requests = [
  ['Time-off requests', '4 time-off requests awaiting approval'],
  ['Attendance', '4 attendance records need review'],
  ['New hires', '2 new employees don’t have a mentor.'],
  ['Permissions', '4 requests awaiting approval'],
]

export function Dashboard({
  data,
  state,
  onUnavailable,
}: {
  data: WorkspaceDetails
  state: DashboardState
  onUnavailable: (name: string) => void
}) {
  const base = `/w/${data.workspace.slug}`
  const filled = state === 'filled'
  const [dismissed, setDismissed] = useState(false)
  const name = data.employee.firstName || 'there'
  const setup = ['setup', 'welcome', 'setup-progress', 'setup-complete'].includes(state)
  const [completed, setCompleted] = useState([false, false, false])
  const [welcome, setWelcome] = useState(false)
  const [welcomeBusy, setWelcomeBusy] = useState(false)
  const [welcomeError, setWelcomeError] = useState('')
  const [storageReady, setStorageReady] = useState(false)
  const [storageError, setStorageError] = useState('')
  const storageKey = `rekann:dashboard-preview:${data.workspace.id}:${data.employee.id}:${state}`
  useEffect(() => {
    setStorageReady(false)
    const defaults =
      state === 'setup-complete'
        ? [true, true, true]
        : state === 'setup-progress'
          ? [true, true, false]
          : [false, false, false]
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || 'null')
      const valid =
        Array.isArray(stored?.completed) &&
        stored.completed.length === 3 &&
        stored.completed.every((x: unknown) => typeof x === 'boolean')
      setCompleted(import.meta.env.DEV && valid ? stored.completed : defaults)
      setDismissed(stored?.dismissed === true)
      const seenLocally = stored?.welcomed === true
      setWelcome(state === 'welcome' && !data.welcomeSeenAt && !seenLocally)
      if (seenLocally && !data.welcomeSeenAt)
        void api('dashboard/welcome', {}).catch((error) => setStorageError(messageOf(error)))
    } catch {
      setCompleted(defaults)
      setStorageError('Setup preview could not be restored on this device.')
      setWelcome(state === 'welcome' && !data.welcomeSeenAt)
    }
    setStorageReady(true)
  }, [storageKey, state, data.welcomeSeenAt])
  useEffect(() => {
    if (!storageReady) return
    try {
      localStorage.setItem(storageKey, JSON.stringify({ completed, dismissed, welcomed: !welcome }))
    } catch {
      setStorageError('Setup preview could not be saved on this device.')
    }
  }, [completed, dismissed, welcome, storageKey, storageReady])
  function setupAction(index: number) {
    if (import.meta.env.DEV) {
      setCompleted((current) => current.map((value, i) => (i === index ? true : value)))
      return
    }
    if (index === 1) window.location.assign(`${base}/team`)
    else onUnavailable(index === 0 ? 'Company settings' : 'Leave policies')
  }
  const allComplete = completed.every(Boolean)
  async function finishWelcome() {
    if (welcomeBusy) return
    setWelcomeBusy(true)
    setWelcomeError('')
    try {
      await api('dashboard/welcome', {})
      setWelcome(false)
      setDismissed(false)
    } catch (error) {
      setWelcomeError(messageOf(error))
    } finally {
      setWelcomeBusy(false)
    }
  }
  return (
    <div className="dashboard" data-state={state} data-setup={setup}>
      <WelcomeCard open={welcome} busy={welcomeBusy} error={welcomeError} onStart={finishWelcome} />
      {storageError && <p role="status">{storageError}</p>}
      <div className="dashboard-heading">
        <h1>
          {setup
            ? allComplete
              ? 'Your workspace is ready'
              : 'Welcome to Rekann'
            : 'Good afternoon'}
          , {name}
        </h1>
        <p>
          {setup
            ? allComplete
              ? 'Start managing your team from your dashboard.'
              : 'Let’s set up your workspace so you can manage your team in one place.'
            : 'Here is your workforce overview and HR insights for today.'}
        </p>
        {setup && dismissed && (
          <button className="dashboard-small-button" onClick={() => setDismissed(false)}>
            Show setup checklist
          </button>
        )}
      </div>
      {state === 'error' ? (
        <section className="dashboard-card dashboard-error" role="alert">
          <h2>We couldn’t load your dashboard</h2>
          <p>Please try again. Your workspace data hasn’t changed.</p>
          <button className="button" onClick={() => window.location.reload()}>
            Try again
          </button>
        </section>
      ) : state === 'loading' ? (
        <DashboardSkeleton />
      ) : (
        <>
          {setup && !dismissed ? (
            <SetupChecklist
              completed={completed}
              onSetup={setupAction}
              onDismiss={() => setDismissed(true)}
            />
          ) : (
            <div className="dashboard-metrics">
              {[
                ['Present today', filled ? 18 : 0, 'Employees present', 'present'],
                ['Pending approvals', filled ? 8 : 0, 'Awaiting decision', 'approvals'],
                ['Reports missing today', filled ? 20 : 0, 'Haven’t submitted yet', 'reports'],
              ].map(([label, value, hint, asset]) => (
                <article className="dashboard-metric" key={label}>
                  <div>
                    <h2>{label}</h2>
                    <strong>{wholeNumber(Number(value))}</strong>
                    <p>{hint}</p>
                  </div>
                  <img
                    src={`/dashboard/${!filled && asset === 'reports' ? 'reports-empty' : asset}.svg`}
                    alt=""
                    width="96"
                    height="90"
                  />
                </article>
              ))}
            </div>
          )}
          <div className="dashboard-middle">
            <section className="dashboard-card attention-card">
              <header>
                <h2>Needs your attention</h2>
                {(filled || setup) && (
                  <button onClick={() => onUnavailable('Approvals')}>
                    See all <img src="/dashboard/see-all.svg" width="14" height="14" alt="" />
                  </button>
                )}
              </header>
              {filled ? (
                <div className="attention-list">
                  {requests.map(([title, description], index) => (
                    <div className="attention-row" key={title}>
                      <img
                        className="attention-icon"
                        src={`/dashboard/${['time-off', 'attendance', 'new-hires', 'permissions'][index]}.svg`}
                        width="36"
                        height="36"
                        alt=""
                      />
                      <div>
                        <h3>{title}</h3>
                        <p title={description}>{description}</p>
                      </div>
                      <button
                        className="dashboard-small-button"
                        onClick={() => onUnavailable(title)}
                      >
                        Review
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="dashboard-empty">
                  <h3>{setup ? 'No alerts at the moment' : 'You’re all caught up'}</h3>
                  <p>
                    {setup
                      ? allComplete
                        ? 'Requests that need your attention will appear here.'
                        : 'Complete the getting-started tasks first, and you will see notifications for your workspace here.'
                      : 'There are no requests to review.'}
                  </p>
                </div>
              )}
            </section>
            <QuickNotes
              key={`${data.workspace.id}-${data.employee.id}`}
              storageKey={`rekann:notes:${data.workspace.id}:${data.employee.id}`}
            />
          </div>
          <div className={`dashboard-bottom ${setup ? 'dashboard-setup-bottom' : ''}`}>
            <section className="dashboard-card detail-card">
              <header>
                <h2>{setup ? 'Today’s Attendance' : 'Today’s attendance'}</h2>
                <strong>{filled ? '90%' : '0'}</strong>
              </header>
              {filled ? (
                <>
                  <Chart values={[15, 3, 2]} colors={['#1da578', '#ff9228', '#ff5262']} />
                  <Legend
                    labels={['On time', 'Late', 'Absent']}
                    values={[15, 3, 2]}
                    markers={['green', 'orange', 'red']}
                  />
                  <footer>
                    Last updated: <span>30 mins ago</span>
                  </footer>
                </>
              ) : (
                <div className="dashboard-empty">
                  <h3>{setup && !allComplete ? 'Add your team' : 'No attendance records yet'}</h3>
                  <p>
                    {setup && !allComplete
                      ? 'Invite employees to join your workspace.'
                      : 'Attendance will appear when employees clock in.'}
                  </p>
                  {setup && (
                    <button className="dashboard-small-button" onClick={() => setupAction(1)}>
                      Add employees
                    </button>
                  )}
                </div>
              )}
            </section>
            <section className="dashboard-card detail-card">
              <header>
                <div>
                  <h2>Who’s off today</h2>
                  <strong>{filled ? '4 employees' : '0'}</strong>
                </div>
                {(filled || setup) && (
                  <button onClick={() => onUnavailable('Time off')}>
                    See all <img src="/dashboard/see-all.svg" width="14" height="14" alt="" />
                  </button>
                )}
              </header>
              {filled ? (
                <div className="off-list">
                  {['Oliver Bennett', 'Lucas Martin', 'Emma Wilson', 'Sophie Laurent'].map(
                    (person, i) => (
                      <button key={person} onClick={() => onUnavailable('Time off')}>
                        <img
                          className="off-avatar"
                          src={'/dashboard/avatar-' + i + '.svg'}
                          alt=""
                          width="36"
                          height="36"
                        />
                        <span>
                          <b>{person}</b>
                          <small>
                            {
                              [
                                '2 days · 9–10 Feb 2026',
                                '1 day · 9 Feb 2026',
                                '3 days · 9–11 Feb 2026',
                                '3 days · 8–10 Feb 2026',
                              ][i]
                            }
                          </small>
                        </span>
                        <img src="/dashboard/row-chevron.svg" width="14" height="14" alt="" />
                      </button>
                    ),
                  )}
                </div>
              ) : (
                <div className="dashboard-empty">
                  <h3>{setup && !allComplete ? 'Set up leave policies' : 'No one is off today'}</h3>
                  <p>
                    {setup && !allComplete
                      ? 'Set up leave types and approval rules.'
                      : 'Approved time off will appear here.'}
                  </p>
                  {setup && (
                    <button className="dashboard-small-button" onClick={() => setupAction(2)}>
                      Set up policies
                    </button>
                  )}
                </div>
              )}
            </section>
            <section className="dashboard-card detail-card">
              <header>
                <h2>Employees by department</h2>
                <strong>{filled ? '24 employees' : '0'}</strong>
              </header>
              {filled ? (
                <>
                  <Chart
                    values={[5, 10, 3, 6]}
                    colors={['#008cff', '#ff9228', '#1da578', '#705cff']}
                  />
                  <Legend
                    labels={['Management', 'Design', 'Lead', 'Operations and HR']}
                    values={[5, 10, 3, 6]}
                    markers={['blue', 'orange', 'green', 'purple']}
                  />
                </>
              ) : (
                <div className="dashboard-empty">
                  <h3>{setup ? 'Create departments' : 'No departments yet'}</h3>
                  <p>Organize your employees into departments.</p>
                  {data.permissions.admin && (
                    <button
                      className="dashboard-small-button"
                      onClick={() => onUnavailable('Departments')}
                    >
                      Add departments
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  )
}
function Chart({ values, colors }: { values: number[]; colors: string[] }) {
  return (
    <div className="dashboard-chart" aria-hidden="true">
      {values.map((value, i) => (
        <span key={i} style={{ flex: value, background: colors[i] }} />
      ))}
    </div>
  )
}
function Legend({
  labels,
  values,
  markers,
}: {
  labels: string[]
  values: number[]
  markers: string[]
}) {
  return (
    <dl className="dashboard-legend">
      {labels.map((label, i) => (
        <div key={label}>
          <dt>
            <img src={`/dashboard/legend-${markers[i]}.png`} width="10" height="10" alt="" />
            {label}
          </dt>
          <dd>{wholeNumber(values[i])}</dd>
        </div>
      ))}
    </dl>
  )
}
export function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton" role="status" aria-label="Loading dashboard">
      <div className="dashboard-metrics">
        {[0, 1, 2].map((i) => (
          <div className="dashboard-metric" key={i}>
            <i />
            <i />
          </div>
        ))}
      </div>
      <div className="dashboard-middle">
        {[0, 1].map((i) => (
          <div className="dashboard-card" key={i}>
            <i />
            <i />
            <i />
          </div>
        ))}
      </div>
      <div className="dashboard-bottom">
        {[0, 1, 2].map((i) => (
          <div className="dashboard-card" key={i}>
            <i />
            <i />
            <i />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading dashboard</span>
    </div>
  )
}
function QuickNotes({ storageKey }: { storageKey: string }) {
  type NoteBlock = { id: string; type: 'text' | 'checklist'; text: string; done: boolean }
  const newBlock = (type: NoteBlock['type'] = 'text', text = ''): NoteBlock => ({
    id: crypto.randomUUID(),
    type,
    text,
    done: false,
  })
  const [blocks, setBlocks] = useState<NoteBlock[]>([])
  const [ready, setReady] = useState(false)
  const [storageError, setStorageError] = useState(false)
  const editors = useRef(new Map<string, HTMLTextAreaElement>())
  const focusNext = useRef<string | null>(null)
  const activeBlock = useRef<string | null>(null)
  const notePlaceholder = 'Write your personal notes...'
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
      const isBlock = (value: unknown): value is NoteBlock =>
        !!value &&
        typeof value === 'object' &&
        'id' in value &&
        typeof value.id === 'string' &&
        'type' in value &&
        (value.type === 'text' || value.type === 'checklist') &&
        'text' in value &&
        typeof value.text === 'string' &&
        'done' in value &&
        typeof value.done === 'boolean'
      if (Array.isArray(saved?.blocks)) {
        const restored = saved.blocks.filter(isBlock).slice(0, 100)
        setBlocks(
          restored.length
            ? restored.map((block: NoteBlock) => ({ ...block, text: block.text.slice(0, 1000) }))
            : [newBlock()],
        )
      } else {
        const note = typeof saved?.notes === 'string' ? saved.notes.slice(0, 1000) : ''
        const legacyItems = Array.isArray(saved?.items)
          ? saved.items.filter(
              (item: unknown): item is { text: string; done: boolean } =>
                !!item &&
                typeof item === 'object' &&
                'text' in item &&
                typeof item.text === 'string' &&
                'done' in item &&
                typeof item.done === 'boolean',
            )
          : []
        setBlocks([
          newBlock('text', note),
          ...legacyItems.slice(0, 20).map((item: { text: string; done: boolean }) => ({
            ...newBlock('checklist', item.text.slice(0, 160)),
            done: item.done,
          })),
        ])
      }
    } catch {
      setStorageError(true)
      setBlocks([newBlock()])
    }
    setReady(true)
  }, [storageKey])
  useEffect(() => {
    if (!ready) return
    try {
      localStorage.setItem(storageKey, JSON.stringify({ blocks }))
    } catch {
      setStorageError(true)
    }
  }, [blocks, ready, storageKey])
  useLayoutEffect(() => {
    if (!CSS.supports('field-sizing', 'content')) {
      for (const editor of editors.current.values()) {
        editor.style.height = 'auto'
        editor.style.height = `${editor.scrollHeight}px`
      }
    }
    const id = focusNext.current
    if (id) {
      editors.current.get(id)?.focus()
      focusNext.current = null
    }
  }, [blocks])
  const insertChecklist = () => {
    const block = newBlock('checklist')
    const index = blocks.findIndex((item) => item.id === activeBlock.current)
    focusNext.current = block.id
    setBlocks((current) => {
      const next = [...current]
      next.splice(index < 0 ? next.length : index + 1, 0, block)
      return next
    })
  }
  return (
    <section className="quick-notes" aria-label="Quick notes">
      <ScrollArea className="notes-scroll">
        <div className="notes-editor">
          {blocks.map((block, index) => (
            <div
              className={`note-line ${block.type === 'checklist' ? 'note-line-checklist' : ''} ${index === 0 && block.type === 'text' && !block.text ? 'note-line-empty' : ''}`}
              key={block.id}
            >
              {block.type === 'checklist' && (
                <input
                  type="checkbox"
                  aria-label={block.text || `Checklist item ${index + 1}`}
                  checked={block.done}
                  onChange={(event) =>
                    setBlocks((current) =>
                      current.map((item) =>
                        item.id === block.id ? { ...item, done: event.target.checked } : item,
                      ),
                    )
                  }
                />
              )}
              <textarea
                ref={(element) => {
                  if (element) editors.current.set(block.id, element)
                  else editors.current.delete(block.id)
                }}
                aria-label={
                  block.type === 'checklist'
                    ? `Checklist item ${index + 1}`
                    : index === 0
                      ? 'Personal notes'
                      : `Personal notes line ${index + 1}`
                }
                placeholder={index === 0 && block.type === 'text' ? notePlaceholder : ''}
                value={block.text}
                rows={1}
                maxLength={1000}
                disabled={!ready}
                className={block.done ? 'is-done' : undefined}
                onFocus={() => {
                  activeBlock.current = block.id
                }}
                onChange={(event) =>
                  setBlocks((current) =>
                    current.map((item) =>
                      item.id === block.id ? { ...item, text: event.target.value } : item,
                    ),
                  )
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    if (block.type === 'checklist' && !block.text.trim()) {
                      setBlocks((current) =>
                        current.map((item) =>
                          item.id === block.id ? { ...item, type: 'text', done: false } : item,
                        ),
                      )
                      focusNext.current = block.id
                      return
                    }
                    const position = event.currentTarget.selectionStart
                    const next = newBlock(block.type, block.text.slice(position))
                    focusNext.current = next.id
                    setBlocks((current) => {
                      const at = current.findIndex((item) => item.id === block.id)
                      const updated = [...current]
                      updated.splice(at, 1, { ...block, text: block.text.slice(0, position) }, next)
                      return updated
                    })
                  } else if (event.key === 'Backspace' && !block.text && index > 0) {
                    event.preventDefault()
                    if (block.type === 'checklist') {
                      focusNext.current = block.id
                      setBlocks((current) =>
                        current.map((item) =>
                          item.id === block.id ? { ...item, type: 'text', done: false } : item,
                        ),
                      )
                    } else {
                      const previous = blocks[index - 1]
                      focusNext.current = previous.id
                      setBlocks((current) => current.filter((item) => item.id !== block.id))
                    }
                  }
                }}
              />
              {index === 0 && block.type === 'text' && !block.text && (
                <span className="note-focus-hint" aria-hidden="true">
                  {notePlaceholder}
                </span>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="notes-toolbar">
        {storageError && <small role="status">Notes could not be saved on this device.</small>}
        <button
          aria-label="Add checklist item"
          disabled={!ready || blocks.length >= 100}
          onClick={insertChecklist}
        >
          <img src="/dashboard/notes-add.svg" width="16" height="16" alt="" />
        </button>
      </div>
    </section>
  )
}

export function DashboardRouteState({ error = false }: { error?: boolean }) {
  return (
    <div className="dash-shell">
      <aside className="dash-sidebar">
        <a className="dash-sidebar-brand" href="/" aria-label="Rekann home">
          <img src="/brand/rekann.svg" width="93" height="24" alt="Rekann" />
        </a>
      </aside>
      <div className="dash-body">
        <header className="dash-topbar">Dashboard</header>
        <main className="dashboard">
          {error ? (
            <section className="dashboard-card dashboard-error" role="alert">
              <h1>We couldn’t load your dashboard</h1>
              <p>Please try again. Your workspace data hasn’t changed.</p>
              <button className="button" onClick={() => window.location.reload()}>
                Try again
              </button>
            </section>
          ) : (
            <DashboardSkeleton />
          )}
        </main>
      </div>
    </div>
  )
}
