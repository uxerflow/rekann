import { useEffect, useRef, useState } from 'react'
import { Button, Field, Notice, Avatar, mediaUrl } from '../../components/ui'
import { SelectField } from '../../components/select-field'
import { DetailDialog } from '../team/detail-dialog'
import type { AdminLeaves, LeaveOption, LeaveRequest } from '../../server/leaves'
import { dateDays } from '../../shared/leaves'
import { api, messageOf } from '../../lib/api'

export const prettyDate = (s: string | Date) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(s))
export const daysText = (n: number | null) =>
  n === null ? 'Unlimited' : `${n} ${n === 1 ? 'day' : 'days'}`
export function LeaveStatus({ status }: { status: string }) {
  return (
    <span className={`leave-status status-${status}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}
function chargedAmount(
  state: AdminLeaves,
  memberId: string,
  type: string,
  start: string,
  end: string,
  duration: string,
  countAs?: string,
) {
  return (
    dateDays(start, end, countAs).filter(
      (day) =>
        !state.policies.some(
          (p) =>
            p.kind === 'closure' &&
            p.active &&
            p.coveredMemberIds.includes(memberId) &&
            (p.rules.approvedRequests === 'Refund their balances' ||
              (type === 'Annual leave' && p.rules.deductAnnual)) &&
            dateDays(p.rules.startDate, p.rules.endDate, p.rules.countAs).includes(day),
        ),
    ).length * (duration === 'Half day' ? 0.5 : 1)
  )
}
export function RecordLeave({
  state,
  workspaceId,
  onClose,
  onSaved,
}: {
  state: AdminLeaves
  workspaceId: string
  onClose: () => void
  onSaved: (message: string) => Promise<void>
}) {
  const people = state.people.filter((p) => p.active && p.id !== state.viewerMemberId)
  const labels = people.map(
    (p) =>
      `${p.name}${people.filter((x) => x.name === p.name).length > 1 ? ` · ${p.jobTitle ? `${p.jobTitle} · ` : ''}${p.id.slice(-6)}` : ''}`,
  )
  const [employee, setEmployee] = useState(''),
    [type, setType] = useState(''),
    [startDate, setStart] = useState(''),
    [endDate, setEnd] = useState(''),
    [duration, setDuration] = useState('Full day'),
    [reason, setReason] = useState('')
  const [options, setOptions] = useState<LeaveOption[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null),
    [attachmentId, setAttachmentId] = useState<string>()
  const [requestId] = useState(() => crypto.randomUUID())
  const person = people[labels.indexOf(employee)],
    selected = options.find((o) => o.name === type)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    setOptions([])
    setError('')
    if (!person) return
    const c = new AbortController()
    setLoading(true)
    fetch(
      `/api/app/leaves/options?${new URLSearchParams({ workspaceId, id: person.id, date: startDate || state.today })}`,
      { signal: c.signal },
    )
      .then(async (r) => {
        if (!r.ok)
          throw new Error('Could not load leave balances. Select the employee again to retry.')
        return r.json() as Promise<LeaveOption[]>
      })
      .then((o) => {
        setOptions(o)
        setType((t) => (o.some((x) => x.name === t) ? t : ''))
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(messageOf(e))
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false)
      })
    return () => c.abort()
  }, [person?.id, startDate, workspaceId, state.today])
  const amount =
    startDate && endDate && endDate >= startDate
      ? dateDays(startDate, endDate, selected?.rules?.countAs).length *
        (duration === 'Half day' ? 0.5 : 1)
      : 0
  const charge = person
    ? chargedAmount(state, person.id, type, startDate, endDate, duration, selected?.rules?.countAs)
    : amount
  const remaining = selected?.remaining === null ? null : (selected?.remaining ?? 0) - charge
  async function save() {
    if (!person || !selected) return
    setBusy(true)
    setError('')
    try {
      let documentId = attachmentId
      if (file && !documentId) {
        documentId = crypto.randomUUID()
        const form = new FormData()
        form.set('file', file)
        form.set(
          'metadata',
          JSON.stringify({
            workspaceId,
            id: person.id,
            documentId,
            version: 0,
            title: file.name,
            category: 'Personal documents',
            visibleToEmployee: true,
          }),
        )
        const r = await fetch('/api/app/employee/document-upload', { method: 'POST', body: form })
        const result = (await r.json()) as { error?: string }
        if (!r.ok) throw new Error(result.error || 'Could not attach this file.')
        setAttachmentId(documentId)
      }
      await api('employee/leave', {
        workspaceId,
        id: person.id,
        requestId,
        type,
        startDate,
        endDate,
        duration,
        reason,
        attachmentId: documentId,
      })
      await onSaved('Time off recorded.')
      onClose()
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <DetailDialog
      className="leave-record-dialog"
      title="Record time off"
      description="Add approved time off for an employee."
      onClose={onClose}
      dirty={!!employee}
      busy={busy}
      footer={
        <>
          <Button className="secondary" data-dialog-close disabled={busy}>
            Cancel
          </Button>
          <Button
            busy={busy}
            disabled={
              !person ||
              !selected ||
              !amount ||
              loading ||
              (remaining !== null && remaining < 0) ||
              (duration === 'Half day' && startDate !== endDate) ||
              (selected?.rules?.document === 'Required' && !file)
            }
            onClick={() => void save()}
          >
            Record time off
          </Button>
        </>
      }
    >
      <div className="leave-form-stack">
        <Notice>{error}</Notice>
        <SelectField
          label="Employee"
          placeholder="Select employee"
          value={employee}
          options={labels}
          searchable
          disabled={busy}
          onChange={(v) => {
            setEmployee(v)
            setType('')
            setFile(null)
            setAttachmentId(undefined)
          }}
        />
        {!people.length && (
          <p className="hint">
            Add an active employee to record time off. Your own leave is requested from your
            employee profile.
          </p>
        )}
        <SelectField
          label="Leave type"
          placeholder={loading ? 'Loading leave types…' : 'Select leave type'}
          value={type}
          options={options.map((o) => o.name)}
          onChange={(v) => {
            setType(v)
            setDuration('Full day')
          }}
          disabled={!person || loading || busy}
        />
        <div className="leave-two-fields">
          <Field
            label="Start date"
            type="date"
            required
            disabled={!person || busy}
            value={startDate}
            onChange={(e) => {
              setStart(e.target.value)
              if (endDate < e.target.value) setEnd(e.target.value)
            }}
          />
          <Field
            label="End date"
            type="date"
            required
            min={startDate}
            disabled={!person || busy}
            value={endDate}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <SelectField
          label="Leave duration"
          placeholder="Full day"
          value={duration}
          options={
            selected?.rules && !selected.rules.halfDay ? ['Full day'] : ['Full day', 'Half day']
          }
          onChange={setDuration}
          disabled={!person || busy}
        />
        <label className="field">
          Reason
          <textarea
            maxLength={2000}
            rows={3}
            placeholder="Add a note"
            value={reason}
            disabled={!person || busy}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <div className="field">
          <label htmlFor="leave-attachment">
            Attachment {selected?.rules?.document === 'Required' ? 'required' : 'optional'}
          </label>
          <input
            ref={input}
            id="leave-attachment"
            className="sr-only"
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            disabled={!person || busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              setAttachmentId(undefined)
            }}
          />
          <Button
            className="secondary leave-file-button"
            disabled={!person || busy}
            onClick={() => input.current?.click()}
          >
            {file ? file.name : 'Attach file'}
          </Button>
        </div>
        <div className="leave-balance">
          <div>
            <strong>{amount ? daysText(amount) : '—'}</strong>
            <span>Requested</span>
          </div>
          <div>
            <strong>{selected ? daysText(remaining) : '—'}</strong>
            <span>After recording</span>
          </div>
        </div>
        <p className="hint">
          {person
            ? selected
              ? `Current balance: ${daysText(selected.remaining)}`
              : 'Select a leave type to see the available balance.'
            : 'Select an employee to see their leave types and balance.'}
        </p>
      </div>
    </DetailDialog>
  )
}
export function ReviewLeave({
  request: r,
  state,
  workspaceId,
  onClose,
  onSaved,
}: {
  request: LeaveRequest
  state: AdminLeaves
  workspaceId: string
  onClose: () => void
  onSaved: (message: string) => Promise<void>
}) {
  const person = state.people.find((p) => p.id === r.memberId)!
  const [action, setAction] = useState<'reject' | 'cancel' | null>(null),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [balance, setBalance] = useState<LeaveOption | null>(null)
  useEffect(() => {
    let live = true
    api<LeaveOption[]>(
      `leaves/options?${new URLSearchParams({ workspaceId, id: r.memberId, date: r.startDate })}`,
    )
      .then((o) => {
        if (live) setBalance(o.find((x) => x.name === r.type) ?? null)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [r.id, workspaceId])
  async function review(next: 'approve' | 'reject' | 'cancel') {
    setBusy(true)
    setError('')
    try {
      await api('employee/leave-review', {
        workspaceId,
        id: r.memberId,
        requestId: r.id,
        action: next,
        reason,
      })
      await onSaved(
        next === 'approve'
          ? 'Request approved.'
          : next === 'reject'
            ? 'Request rejected.'
            : 'Time off cancelled.',
      )
      onClose()
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }
  const own = r.memberId === state.viewerMemberId
  return (
    <DetailDialog
      className="leave-review-dialog"
      title={
        action === 'reject'
          ? 'Reject request'
          : action === 'cancel'
            ? 'Cancel time off?'
            : 'Request details'
      }
      onClose={onClose}
      busy={busy}
      footer={
        action ? (
          <>
            <Button className="secondary" disabled={busy} onClick={() => setAction(null)}>
              Keep request
            </Button>
            <Button
              className="destructive"
              busy={busy}
              disabled={action === 'reject' && !reason.trim()}
              onClick={() => void review(action)}
            >
              {action === 'reject' ? 'Reject request' : 'Cancel time off'}
            </Button>
          </>
        ) : (
          <>
            {r.status === 'pending' && !own ? (
              <>
                <Button className="secondary" disabled={busy} onClick={() => setAction('reject')}>
                  Reject
                </Button>
                <Button busy={busy} onClick={() => void review('approve')}>
                  Approve
                </Button>
              </>
            ) : (
              <>
                {['pending', 'approved'].includes(r.status) && (
                  <Button className="secondary" disabled={busy} onClick={() => setAction('cancel')}>
                    Cancel time off
                  </Button>
                )}
                <Button className="secondary" data-dialog-close>
                  Close
                </Button>
              </>
            )}
          </>
        )
      }
    >
      <Notice>{error}</Notice>
      <div className="leave-person">
        <Avatar name={person.name} image={mediaUrl(person.avatarKey)} />
        <div>
          <strong>{person.name}</strong>
          <span>{[person.jobTitle, person.department].filter(Boolean).join(' · ')}</span>
        </div>
      </div>
      {action ? (
        <div className="leave-form-stack">
          <p>
            {action === 'reject'
              ? 'Add a reason so the employee understands this decision.'
              : 'The time off will be removed from the calendar and its balance returned.'}
          </p>
          {action === 'reject' && (
            <label className="field">
              Reason
              <textarea
                value={reason}
                maxLength={2000}
                rows={4}
                onChange={(e) => setReason(e.target.value)}
                disabled={busy}
              />
            </label>
          )}
        </div>
      ) : (
        <>
          <dl className="leave-detail-list">
            {[
              ['Requested on', prettyDate(r.createdAt)],
              ['Leave type', r.type],
              ['Date', `${prettyDate(r.startDate)} → ${prettyDate(r.endDate)}`],
              ['Duration', daysText(r.halfDays / 2)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            <div>
              <dt>Status</dt>
              <dd>
                <LeaveStatus status={r.status} />
              </dd>
            </div>
          </dl>
          <section className="leave-detail-section">
            <h3>Detail information</h3>
            <span>Reason</span>
            <p>{r.reason || 'No reason provided'}</p>
            <span>Attachment</span>
            <p>
              {r.attachmentId ? (
                <a
                  href={`/api/app/employee/document-file?${new URLSearchParams({ workspaceId, id: r.memberId, documentId: r.attachmentId, download: '1' })}`}
                >
                  Download attachment
                </a>
              ) : (
                'No attachment'
              )}
            </p>
            {r.rejectionReason && (
              <>
                <span>Decision note</span>
                <p>{r.rejectionReason}</p>
              </>
            )}
          </section>
          {balance && r.status === 'pending' && (
            <section className="leave-detail-section">
              <h3>Leave balance</h3>
              <dl className="leave-detail-list">
                <div>
                  <dt>Current balance</dt>
                  <dd>{daysText(balance.remaining)}</dd>
                </div>
                <div>
                  <dt>After approval</dt>
                  <dd>
                    {daysText(
                      balance.remaining === null
                        ? null
                        : balance.remaining -
                            chargedAmount(
                              state,
                              r.memberId,
                              r.type,
                              r.startDate,
                              r.endDate,
                              r.duration,
                              r.policyRules?.countAs,
                            ),
                    )}
                  </dd>
                </div>
              </dl>
            </section>
          )}
          {own && r.status === 'pending' && (
            <p className="hint">Another authorized reviewer must review your request.</p>
          )}
        </>
      )}
    </DetailDialog>
  )
}
