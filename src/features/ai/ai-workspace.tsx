import { AiMemoryDialog } from './ai-memory'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  BookOpen,
  Plus,
  Sparkles,
  ArrowUp,
  ArrowRight,
  Users,
  Search,
  Pencil,
  UserPlus,
  Settings,
  Square,
  X,
} from 'lucide-react'
import { Button, Field, Notice } from '../../components/ui'
import { ScrollArea } from '../../components/scroll-area'
import { SelectField } from '../../components/select-field'
import { DetailDialog } from '../team/detail-dialog'
import { AiConnection } from './ai-settings'
import { api, messageOf } from '../../lib/api'
import { aiFieldLabels, type AiField, type AiTurn, type AiSettings } from '../../shared/ai'
import './ai.css'

export function AiWorkspace({
  workspaceId,
  slug,
  name,
  compact = false,
  onClose,
}: {
  workspaceId: string
  slug: string
  name: string
  compact?: boolean
  onClose?: () => void
}) {
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [turns, setTurns] = useState<AiTurn[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [connection, setConnection] = useState<AiSettings['funding'] | null>(null)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [editing, setEditing] = useState<AiTurn | null>(null)
  const pending = useRef<{ id: string; text: string } | null>(null)
  const controller = useRef<AbortController | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const alive = useRef(true)
  const base = `/w/${slug}`
  async function refreshAllowance() {
    try {
      const value = await api<AiSettings>(`ai/settings?workspaceId=${workspaceId}`)
      if (alive.current) setSettings(value)
    } catch {
      /* Preserve the last known settings during a transient connection failure. */
    }
  }
  async function load() {
    setLoading(true)
    setError('')
    try {
      const s = await api<AiSettings>(`ai/settings?workspaceId=${workspaceId}`)
      if (!alive.current) return
      setSettings(s)
      const history = s.available
        ? await api<AiTurn[]>(`ai/history?workspaceId=${workspaceId}`)
        : []
      if (alive.current) setTurns(history)
    } catch (e) {
      if (alive.current) setError(messageOf(e))
    } finally {
      if (alive.current) setLoading(false)
    }
  }
  useEffect(() => {
    alive.current = true
    void load()
    return () => {
      alive.current = false
      controller.current?.abort()
    }
  }, [workspaceId])
  useEffect(() => {
    if (busy || !turns.some((t) => t.status === 'pending')) return
    const timer = setInterval(() => {
      void api<AiTurn[]>(`ai/history?workspaceId=${workspaceId}`)
        .then((history) => {
          if (alive.current) setTurns(history)
        })
        .catch(() => {})
    }, 3000)
    return () => clearInterval(timer)
  }, [busy, turns, workspaceId])
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'instant', block: 'nearest' })
  }, [turns.length, busy])
  function replace(turn: AiTurn) {
    setTurns((current) =>
      current.some((t) => t.id === turn.id)
        ? current.map((t) => (t.id === turn.id ? turn : t))
        : [...current, turn],
    )
  }
  async function send(e: FormEvent) {
    e.preventDefault()
    if (busy || !input.trim() || !settings?.available) return
    const request =
      pending.current?.text === input.trim()
        ? pending.current
        : { id: crypto.randomUUID(), text: input.trim() }
    pending.current = request
    setBusy(true)
    setError('')
    const abort = new AbortController()
    controller.current = abort
    replace({
      id: request.id,
      prompt: request.text,
      status: 'pending',
      result: null,
      version: 0,
      createdAt: new Date().toISOString(),
    })
    try {
      const response = await fetch('/api/app/ai/message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        signal: abort.signal,
        body: JSON.stringify({ workspaceId, requestId: request.id, message: request.text }),
      })
      const turn = (await response.json()) as AiTurn & { error?: string }
      if (!response.ok) throw new Error(turn.error || 'Something went wrong. Please try again.')
      if (alive.current) {
        replace(turn)
        setInput('')
        pending.current = null
      }
    } catch (e) {
      if (alive.current && !abort.signal.aborted) {
        setError(messageOf(e))
        setTurns((t) => t.filter((t) => t.id !== request.id || t.status !== 'pending'))
      }
    } finally {
      if (alive.current && !abort.signal.aborted) setBusy(false)
      if (alive.current) void refreshAllowance()
    }
  }
  async function mutate(
    turn: AiTurn,
    action: 'confirm' | 'cancel' | 'revise',
    changes?: { field: AiField; value: string }[],
  ) {
    setError('')
    setBusy(true)
    try {
      const saved = await api<AiTurn>('ai/action', {
        workspaceId,
        id: turn.id,
        version: turn.version,
        action,
        ...(changes ? { changes } : {}),
      })
      replace(saved)
      return true
    } catch (e) {
      setError(messageOf(e))
      return false
    } finally {
      setBusy(false)
    }
  }
  async function stop() {
    const request = pending.current
    if (!request) return
    controller.current?.abort()
    const turn = turns.find((t) => t.id === request.id)
    if (turn && (await mutate(turn, 'cancel'))) {
      pending.current = null
      setInput('')
    }
  }
  const suggestions = [
    {
      title: 'Find a teammate',
      text: 'Find people by name.',
      prompt: 'Find employees in Design',
      Icon: Search,
    },
    {
      title: 'Team overview',
      text: 'Count your employees.',
      prompt: 'How many employees are in our directory?',
      Icon: Users,
    },
    {
      title: 'Add an employee',
      text: 'Review a new teammate.',
      prompt: 'Help me add a new employee',
      Icon: UserPlus,
    },
    {
      title: 'Update work details',
      text: 'Update work information.',
      prompt: 'Help me update an employee’s job title',
      Icon: Pencil,
    },
  ]
  const composer = (
    <form className="ai-composer" onSubmit={send}>
      <label className="sr-only" htmlFor={compact ? 'ai-message-drawer' : 'ai-message'}>
        Message Rekann AI
      </label>
      <textarea
        id={compact ? 'ai-message-drawer' : 'ai-message'}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={compact ? 'Ask about your team...' : 'Ask anything about your team...'}
        maxLength={2000}
        disabled={loading || !settings?.available}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            e.currentTarget.form?.requestSubmit()
          }
        }}
      />
      <div className="ai-composer-footer">
        <div className="ai-context-controls">
          <button
            type="button"
            className="ai-attach"
            disabled
            aria-label="Add attachment (coming soon)"
            title="Attachments are coming soon"
          >
            <Plus size={16} />
          </button>
          <SelectField
            label="Data context"
            placeholder="Choose context"
            value="Team directory"
            options={[
              'All data',
              'Team directory',
              'Department and teams',
              'Attendance',
              'Leaves',
              'Permissions',
              'Daily reports',
              'Projects',
            ]}
            disabledOptions={[
              'All data',
              'Department and teams',
              'Attendance',
              'Leaves',
              'Permissions',
              'Daily reports',
              'Projects',
            ]}
            onChange={() => {}}
            prefix={<Users size={16} />}
            compact
            required={false}
            menuWidth={232}
          />
        </div>
        <div>
          <SelectField
            label="AI model"
            placeholder="Choose model"
            value={settings?.funding === 'workspace' ? 'GPT-4.1 mini' : 'Rekann AI'}
            options={[settings?.funding === 'workspace' ? 'GPT-4.1 mini' : 'Rekann AI']}
            onChange={() => {}}
            prefix={<img className="ai-model-logo" src="/dashboard/assistant-logo.svg" alt="" />}
            compact
            required={false}
            menuWidth={264}
            onOpen={() => void refreshAllowance()}
            menuDescription={
              settings && (
                <>
                  <p>
                    <strong>
                      {settings.requestAllowance.remaining} of {settings.requestAllowance.limit}{' '}
                      requests left today
                    </strong>
                  </p>
                  <p>Your allowance · resets at 00:00 UTC</p>
                  <p>
                    {settings.funding === 'rekann'
                      ? 'Shared usage limits also apply.'
                      : 'Workspace token limits also apply.'}
                  </p>
                </>
              )
            }
            menuAction={{
              section: 'OWN AI PROVIDER',
              label: settings?.admin
                ? settings.workspaceKeyConnected
                  ? 'Manage AI provider'
                  : 'Connect AI provider'
                : 'Ask your admin to connect',
              icon: <Plus size={16} />,
              disabled: !settings?.admin || busy,
              onSelect: () => setConnection('workspace'),
            }}
          />
          {busy && pending.current ? (
            <button
              type="button"
              className="ai-send"
              aria-label="Stop request"
              onClick={() => void stop()}
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              className="ai-send"
              aria-label="Send message"
              disabled={busy || !settings?.available || !input.trim()}
            >
              <ArrowUp size={18} />
            </button>
          )}
        </div>
      </div>
    </form>
  )
  return (
    <section className={`ai-workspace ${compact ? 'ai-compact' : ''}`} aria-label="Rekann AI">
      <div className="ai-toolbar">
        {compact && <strong id="assistant-title">Assistant</strong>}
        <div>
          {settings && (
            <button
              className="ai-text-button"
              aria-label="Your memory"
              title="Your memory"
              onClick={() => setMemoryOpen(true)}
              disabled={busy}
            >
              <BookOpen size={14} />
              {!compact && 'Your memory'}
            </button>
          )}
          {settings?.admin && (
            <button
              className="ai-text-button"
              aria-label="AI settings"
              title="AI settings"
              onClick={() => setConnection(settings?.funding || 'rekann')}
            >
              <Settings size={14} />
              {!compact && 'AI settings'}
            </button>
          )}
          {compact && (
            <>
              <a
                className="ai-text-button"
                aria-label="Open AI page"
                title="Open AI page"
                href={`${base}/ai`}
              >
                <ArrowRight size={16} />
              </a>
              <button className="icon-button" aria-label="Close Assistant" onClick={onClose}>
                <X size={16} />
              </button>
            </>
          )}
        </div>
      </div>
      {loading ? (
        <div className="ai-loading" role="status">
          Getting your workspace ready...
        </div>
      ) : (
        <>
          {error && (
            <div className="ai-notice">
              <Notice>{error}</Notice>
              <button className="ai-text-button" onClick={() => void load()} disabled={busy}>
                Reload
              </button>
            </div>
          )}
          {!settings?.available && settings && (
            <div className="ai-availability" role="status">
              <span className="ai-availability-icon">
                <Sparkles size={18} />
              </span>
              <div>
                <strong>
                  {settings.unavailableReason === 'service'
                    ? 'Your assistant is getting ready'
                    : settings.unavailableReason === 'paused'
                      ? 'AI is paused for this workspace'
                      : settings.unavailableReason === 'connection'
                        ? 'Connect your OpenRouter account'
                        : 'AI access is managed by your admin'}
                </strong>
                <p>
                  {settings.unavailableReason === 'service'
                    ? 'Rekann AI is included. You can use your own key in the meantime.'
                    : settings.unavailableReason === 'connection'
                      ? 'Add a key to use your account, or switch to Rekann AI.'
                      : 'Your workspace admin can update access in AI settings.'}
                </p>
              </div>
              {settings.admin && (
                <Button
                  className="secondary"
                  onClick={() =>
                    setConnection(
                      settings.unavailableReason === 'service' ? 'workspace' : settings.funding,
                    )
                  }
                >
                  {settings.unavailableReason === 'service' ? 'Use your own key' : 'AI settings'}
                </Button>
              )}
            </div>
          )}
          {!turns.length ? (
            <>
              <ScrollArea className="ai-welcome-scroll">
                <div className="ai-welcome">
                  <img
                    className="ai-welcome-logo"
                    src="/dashboard/assistant-logo.svg"
                    width="32"
                    height="32"
                    alt=""
                  />
                  <h1>{compact ? 'Rekann Assistant' : `Hello, ${name || 'there'}`}</h1>
                  <p>
                    {compact
                      ? 'Ask questions about your team and manage everyday HR tasks.'
                      : 'Find your people. Take care of the details.'}
                  </p>
                  {!compact && composer}
                  <div className="ai-suggestions">
                    {suggestions
                      .filter((s) => settings?.allowWrites || s.Icon === Search || s.Icon === Users)
                      .map((s) => (
                        <button
                          key={s.title}
                          onClick={() => setInput(s.prompt)}
                          disabled={!settings?.available}
                        >
                          <s.Icon size={16} />
                          <strong>{s.title}</strong>
                          <span>{s.text}</span>
                        </button>
                      ))}
                  </div>
                </div>
              </ScrollArea>
              {compact && (
                <div className="ai-bottom">
                  {composer}
                  <small className="ai-drawer-disclaimer">
                    AI can make mistakes. Always verify important information.
                  </small>
                </div>
              )}
            </>
          ) : (
            <>
              <ScrollArea className="ai-thread-scroll">
                <div className="ai-thread">
                  {turns.map((t) => (
                    <article key={t.id} className="ai-turn">
                      <div className="ai-user-message">{t.prompt}</div>
                      {t.status === 'pending' ? (
                        <p role="status" className="ai-working">
                          Checking your request...
                        </p>
                      ) : (
                        <div className="ai-response">
                          <p>{t.result?.message}</p>
                          {t.result?.people?.map((p) => (
                            <a
                              className="ai-person"
                              key={p.id}
                              href={`${base}/team/records/${p.id}`}
                            >
                              <span>
                                <strong>{p.name}</strong>
                                <small>
                                  {[p.jobTitle, p.department].filter(Boolean).join(' · ') ||
                                    p.email}
                                </small>
                              </span>
                              <ArrowRight size={16} />
                            </a>
                          ))}
                          {t.result?.draft && t.status === 'draft' && (
                            <div className="ai-draft">
                              <header>
                                <h2>
                                  {t.result.draft.kind === 'create'
                                    ? 'New employee'
                                    : 'Review changes'}
                                </h2>
                                <p>
                                  {t.result.draft.kind === 'create'
                                    ? 'Check the details before adding them to your team.'
                                    : t.result.draft.before.fullName}
                                </p>
                              </header>
                              <dl>
                                {Object.entries(t.result.draft.fields)
                                  .sort(
                                    ([a], [b]) =>
                                      Object.keys(aiFieldLabels).indexOf(a) -
                                      Object.keys(aiFieldLabels).indexOf(b),
                                  )
                                  .map(([key, value]) => (
                                    <div key={key}>
                                      <dt>{aiFieldLabels[key as AiField]}</dt>
                                      <dd>
                                        {t.result!.draft!.kind === 'update' && (
                                          <span className="ai-before">
                                            {t.result!.draft!.before[key as AiField] || 'Not set'}{' '}
                                            <ArrowRight size={12} />
                                          </span>
                                        )}
                                        {value || (
                                          <span
                                            className={
                                              t.result!.draft!.missing.includes(key)
                                                ? 'ai-missing'
                                                : 'ai-optional'
                                            }
                                          >
                                            {t.result!.draft!.missing.includes(key)
                                              ? 'Needs your input'
                                              : 'Not set'}
                                          </span>
                                        )}
                                      </dd>
                                    </div>
                                  ))}
                              </dl>
                              {!!t.result.draft.missing.length && (
                                <p className="ai-required">
                                  {t.result.draft.missing
                                    .map((k) => aiFieldLabels[k as AiField])
                                    .join(', ')}{' '}
                                  still needed.
                                </p>
                              )}
                              <footer>
                                <Button
                                  className="secondary"
                                  onClick={() => setEditing(t)}
                                  disabled={busy}
                                >
                                  Review details
                                </Button>
                                <Button
                                  disabled={busy || !!t.result.draft.missing.length}
                                  onClick={() => void mutate(t, 'confirm')}
                                >
                                  {t.result.draft.kind === 'create'
                                    ? 'Add employee'
                                    : 'Confirm changes'}
                                </Button>
                                <button
                                  className="ai-text-button"
                                  disabled={busy}
                                  onClick={() => void mutate(t, 'cancel')}
                                >
                                  Cancel
                                </button>
                              </footer>
                            </div>
                          )}
                          {t.result?.savedId && (
                            <a
                              className="ai-view"
                              href={`${base}/team/records/${t.result.savedId}`}
                            >
                              View employee <ArrowRight size={16} />
                            </a>
                          )}
                          {t.status === 'failed' && (
                            <button
                              className="ai-text-button"
                              onClick={() => {
                                pending.current = null
                                setInput(t.prompt)
                              }}
                              disabled={busy}
                            >
                              Try again
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  ))}
                  <div ref={bottom} />
                </div>
              </ScrollArea>
              <div className="ai-bottom">{composer}</div>
            </>
          )}
        </>
      )}
      {memoryOpen && (
        <AiMemoryDialog
          workspaceId={workspaceId}
          funding={settings?.funding ?? 'rekann'}
          onClose={() => setMemoryOpen(false)}
          onCleared={() => {
            setTurns([])
            pending.current = null
            setInput('')
          }}
        />
      )}
      {connection && settings?.admin && (
        <AiConnection
          initialFunding={connection}
          workspaceId={workspaceId}
          settings={settings}
          onSaved={(s) => {
            setSettings(s)
            void load()
          }}
          onClose={() => setConnection(null)}
        />
      )}
      {editing && (
        <DraftEditor
          turn={editing}
          onClose={() => setEditing(null)}
          onSave={async (changes) => {
            if (await mutate(editing, 'revise', changes)) setEditing(null)
          }}
          busy={busy}
          error={error}
        />
      )}
    </section>
  )
}
function DraftEditor({
  turn,
  onClose,
  onSave,
  busy,
  error,
}: {
  turn: AiTurn
  onClose: () => void
  onSave: (changes: { field: AiField; value: string }[]) => Promise<void>
  busy: boolean
  error: string
}) {
  const draft = turn.result!.draft!
  const [values, setValues] = useState(draft.fields)
  const keys: AiField[] =
    draft.kind === 'create'
      ? [
          'fullName',
          'email',
          'employeeNumber',
          'department',
          'jobTitle',
          'employmentType',
          'startDate',
        ]
      : (Object.keys(draft.fields) as AiField[])
  return (
    <DetailDialog
      title={draft.kind === 'create' ? 'Review employee details' : 'Review work details'}
      description="Save the draft, then confirm it in the conversation. This step does not change the employee."
      onClose={onClose}
      busy={busy}
      dirty={JSON.stringify(values) !== JSON.stringify(draft.fields)}
      footer={
        <>
          <Button className="secondary" disabled={busy} data-dialog-close>
            Cancel
          </Button>
          <Button
            busy={busy}
            onClick={() =>
              void onSave(keys.map((field) => ({ field, value: values[field] || '' })))
            }
          >
            Save draft
          </Button>
        </>
      }
    >
      <div className="ai-settings-fields">
        <Notice>{error}</Notice>
        {keys.map((field) =>
          field === 'employmentType' ? (
            <SelectField
              key={field}
              label="Employment type"
              value={values[field] || ''}
              onChange={(value) => setValues((v) => ({ ...v, [field]: value }))}
              options={['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance']}
              placeholder="Choose employment type"
            />
          ) : (
            <Field
              key={field}
              label={aiFieldLabels[field]}
              value={values[field] || ''}
              required={
                draft.kind === 'create' &&
                ['fullName', 'email', 'employeeNumber', 'startDate'].includes(field)
              }
              type={field === 'startDate' ? 'date' : field === 'email' ? 'email' : 'text'}
              onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
            />
          ),
        )}
      </div>
    </DetailDialog>
  )
}
