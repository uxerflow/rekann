import { useEffect, useState } from 'react'
import { Check, X, ListChecks } from 'lucide-react'
import { ScrollArea } from '../../components/scroll-area'
import type { WorkspaceDetails } from '../../server/workspaces'
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
      setWelcome(state === 'welcome' && stored?.welcomed !== true)
    } catch {
      setCompleted(defaults)
      setStorageError('Setup preview could not be restored on this device.')
    }
    setStorageReady(true)
  }, [storageKey, state])
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
  return (
    <div className="dashboard" data-state={state} data-setup={setup}>
      <WelcomeCard
        open={welcome}
        onStart={() => {
          setWelcome(false)
          setDismissed(false)
        }}
      />
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
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<{ text: string; done: boolean }[]>([])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [ready, setReady] = useState(false)
  const [storageError, setStorageError] = useState(false)
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
      if (saved) {
        if (typeof saved.notes === 'string') setNotes(saved.notes.slice(0, 1000))
        if (Array.isArray(saved.items))
          setItems(
            saved.items
              .filter(
                (v: unknown): v is { text: string; done: boolean } =>
                  !!v &&
                  typeof v === 'object' &&
                  'text' in v &&
                  typeof v.text === 'string' &&
                  'done' in v &&
                  typeof v.done === 'boolean',
              )
              .slice(0, 20)
              .map((v: { text: string; done: boolean }) => ({ ...v, text: v.text.slice(0, 160) })),
          )
      }
    } catch {
      setStorageError(true)
    }
    setReady(true)
  }, [storageKey])
  useEffect(() => {
    if (!ready) return
    try {
      localStorage.setItem(storageKey, JSON.stringify({ notes, items }))
    } catch {
      setStorageError(true)
    }
  }, [notes, items, ready, storageKey])
  return (
    <section className="quick-notes" aria-label="Quick notes">
      <ScrollArea className="notes-scroll">
        <textarea
          aria-label="Personal notes"
          placeholder="Write your personal notes..."
          value={notes}
          maxLength={1000}
          disabled={!ready}
          onChange={(e) => setNotes(e.target.value)}
        />
        {items.map((item, i) => (
          <label className="note-task" key={i}>
            <input
              type="checkbox"
              checked={item.done}
              onChange={(e) =>
                setItems(items.map((v, j) => (j === i ? { ...v, done: e.target.checked } : v)))
              }
            />
            <span className={item.done ? 'is-done' : ''}>{item.text}</span>
          </label>
        ))}
        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (draft.trim()) {
                setItems([...items, { text: draft.trim(), done: false }])
                setDraft('')
                setEditing(false)
              }
            }}
          >
            <input
              autoFocus
              aria-label="New checklist item"
              placeholder="Add a task"
              value={draft}
              maxLength={160}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className="sr-only" type="submit">
              Save task
            </button>
          </form>
        )}
      </ScrollArea>
      <div className="notes-toolbar">
        {storageError && <small role="status">Notes could not be saved on this device.</small>}
        {editing && (
          <button
            aria-label="Save checklist item"
            disabled={!draft.trim()}
            onClick={() => {
              setItems([...items, { text: draft.trim(), done: false }])
              setDraft('')
              setEditing(false)
            }}
          >
            <ListChecks size={16} />
          </button>
        )}
        <button
          aria-label={editing ? 'Cancel checklist item' : 'Add checklist item'}
          disabled={!ready || (!editing && items.length >= 20)}
          onClick={() => {
            setEditing(!editing)
            setDraft('')
          }}
        >
          {editing ? (
            <X size={16} />
          ) : (
            <img src="/dashboard/notes-add.svg" width="16" height="16" alt="" />
          )}
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
