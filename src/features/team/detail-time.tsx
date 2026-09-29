import { useState } from 'react'
import { CalendarDays, Clock3, FileText, MoreHorizontal } from 'lucide-react'
import { Button, Field, Notice } from '../../components/ui'
import { SelectField } from '../../components/select-field'
import { DetailToast } from './detail-toast'
import { DetailDialog } from './detail-dialog'
import type { EmployeeDetail } from '../../server/employee-detail'
import type { EmployeeTime } from '../../server/employee-time'
import type { EmployeeDocument } from '../../server/employee-documents'
import { api, messageOf } from '../../lib/api'
import { leaveDays, leaveTypes } from '../../shared/employee-detail'
export const formatDate = (v: string) =>
  new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(v))
const hours = (seconds: number) =>
  `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
export function DetailEmpty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="detail-empty">
      <FileText size={24} />
      <h3>{title}</h3>
      {body && <p>{body}</p>}
    </div>
  )
}
export function DetailAttendance({
  time,
  detail,
  zone,
  month,
  setMonth,
  workspaceId,
  reload,
}: {
  time: EmployeeTime
  detail: EmployeeDetail
  zone: string
  month: string
  setMonth: (s: string) => void
  workspaceId: string
  reload: () => Promise<void>
}) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [clockId, setClockId] = useState(() => crypto.randomUUID())
  const open = time.openRecord
  async function clock() {
    setBusy(true)
    try {
      await api('employee/clock', {
        workspaceId,
        id: detail.id,
        action: open ? 'out' : 'in',
        attendanceId: open?.id || clockId,
      })
      setClockId(crypto.randomUUID())
      setError('')
      await reload()
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div className="employee-section-heading">
        <h2>{detail.fields.fullName.split(' ')[0]}’s attendance</h2>
        <div className="detail-inline">
          <Field
            label="Attendance month"
            compact
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          {detail.permissions.self && detail.accountActive && (
            <Button busy={busy} onClick={() => void clock()}>
              {open ? 'Clock out' : 'Clock in'}
            </Button>
          )}
        </div>
      </div>
      <Notice>{error}</Notice>
      <div className="employee-work-cards detail-metrics">
        {[
          ['Total records', String(time.records.length), 'Total this month'],
          ['Total hours', hours(time.totalSeconds), 'Total this month'],
          ['Average hours/day', hours(time.averageSeconds), 'Average this month'],
        ].map(([label, value, note], i) => (
          <article key={label}>
            <span className={`detail-metric-icon tone-${i}`}>
              <Clock3 size={14} />
            </span>
            <h3>{label}</h3>
            <strong>{value}</strong>
            <p>{note}</p>
          </article>
        ))}
      </div>
      {!time.records.length ? (
        <DetailEmpty
          title="No attendance records yet"
          body="Attendance will appear here when the employee starts recording their time."
        />
      ) : (
        <div className="detail-table-scroll">
          <table className="detail-table">
            <thead>
              <tr>
                <th>
                  <CalendarDays size={14} />
                  Date
                </th>
                <th>Clock in</th>
                <th>Clock out</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {time.records.map((r) => (
                <tr key={r.id}>
                  <td>
                    {new Intl.DateTimeFormat('en-US', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      timeZone: zone,
                    }).format(new Date(r.clockIn))}
                  </td>
                  {[r.clockIn, r.clockOut].map((t, i) => (
                    <td key={i}>
                      {t ? (
                        <>
                          <time>
                            {new Intl.DateTimeFormat('en-GB', {
                              timeZone: zone,
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            }).format(new Date(t))}
                          </time>
                          <span className="detail-zone">{zone}</span>
                        </>
                      ) : (
                        'In progress'
                      )}
                    </td>
                  ))}
                  <td>
                    {r.clockOut
                      ? hours(
                          (new Date(r.clockOut).getTime() - new Date(r.clockIn).getTime()) / 1000,
                        )
                      : 'In progress'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
type Leave = EmployeeTime['leaves'][number]
export function DetailLeaves({
  time,
  detail,
  workspaceId,
  reload,
  documents,
  month,
}: {
  time: EmployeeTime
  detail: EmployeeDetail
  workspaceId: string
  reload: () => Promise<void>
  documents: EmployeeDocument[]
  month: string
}) {
  const [mode, setMode] = useState<'record' | 'allowance' | 'request' | 'reject' | 'cancel' | null>(
    null,
  )
  const [selected, setSelected] = useState<Leave | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [requestId, setRequestId] = useState('')
  const [type, setType] = useState<string>('Annual leave')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [duration, setDuration] = useState('Full day')
  const [reason, setReason] = useState('')
  const [attachment, setAttachment] = useState('')
  const [days, setDays] = useState('')
  const [year, setYear] = useState(month.slice(0, 4))
  const yearLeaves = time.leaves.filter((l) => l.startDate.startsWith(month.slice(0, 4)))
  const allowance = time.allowances.find(
    (a) => a.type === type && a.year === Number((start || month).slice(0, 4)),
  )
  const balance =
    type === 'Unpaid leave'
      ? 'Not limited'
      : allowance
        ? `${(allowance.halfDays - allowance.usedHalfDays) / 2} days`
        : 'Not set'
  async function run(operation: string, payload: object, message: string) {
    setBusy(true)
    setError('')
    try {
      await api(operation, { workspaceId, id: detail.id, ...payload })
      await reload()
      setMode(null)
      setNotice(message)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }
  function openRecord() {
    setMode('record')
    setRequestId(crypto.randomUUID())
    setError('')
    setStart('')
    setEnd('')
    setReason('')
    setAttachment('')
  }
  const requestBalance = selected
    ? time.allowances.find(
        (a) => a.type === selected.type && a.year === Number(selected.startDate.slice(0, 4)),
      )
    : null
  return (
    <>
      <div className="employee-section-heading">
        <h2>Leave history</h2>
        <div className="detail-inline">
          {detail.permissions.admin && (
            <Button
              className="secondary"
              onClick={() => {
                setMode('allowance')
                setError('')
                setDays('')
              }}
            >
              Set allowance
            </Button>
          )}
          {(detail.permissions.edit || detail.permissions.self) && detail.accountActive && (
            <Button className="secondary" onClick={openRecord}>
              {detail.permissions.self ? 'Request time off' : 'Record time off'}
            </Button>
          )}
        </div>
      </div>
      <DetailToast message={notice} onDismiss={() => setNotice('')} />
      {!mode && <Notice>{error}</Notice>}
      <div className="employee-work-cards detail-leave-metrics">
        {[
          [
            'Total leave',
            String(
              yearLeaves
                .filter((r) => r.status === 'approved')
                .reduce((s, r) => s + r.halfDays / 2, 0),
            ),
            'Approved days',
          ],
          [
            'Approved',
            String(yearLeaves.filter((r) => r.status === 'approved').length),
            'Leave requests',
          ],
          [
            'Pending',
            String(yearLeaves.filter((r) => r.status === 'pending').length),
            'Awaiting review',
          ],
          [
            'Rejected',
            String(yearLeaves.filter((r) => r.status === 'rejected').length),
            'Leave requests',
          ],
        ].map(([label, value, note], i) => (
          <article key={label}>
            <span className={`detail-metric-icon tone-${i}`}>
              <CalendarDays size={14} />
            </span>
            <h3>{label}</h3>
            <strong>{value}</strong>
            <p>{note}</p>
          </article>
        ))}
      </div>
      {!time.leaves.length ? (
        <DetailEmpty
          title="No time off recorded"
          body="Leave requests and recorded time off will appear here."
        />
      ) : (
        <div className="detail-table-scroll">
          <table className="detail-table">
            <thead>
              <tr>
                {['Type', 'Dates', 'Duration', 'Submitted', 'Status', ''].map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {time.leaves.map((l) => (
                <tr key={l.id}>
                  <td>{l.type}</td>
                  <td>
                    {formatDate(l.startDate)}
                    {l.endDate !== l.startDate && ` → ${formatDate(l.endDate)}`}
                  </td>
                  <td>
                    {l.halfDays / 2} {l.halfDays === 2 ? 'day' : 'days'}
                  </td>
                  <td>{formatDate(String(l.createdAt))}</td>
                  <td>
                    <span className={`detail-status ${l.status}`}>{l.status}</span>
                  </td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`View ${l.type} on ${l.startDate}`}
                      onClick={() => {
                        setSelected(l)
                        setMode('request')
                        setError('')
                      }}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {mode === 'record' && (
        <DetailDialog
          title={detail.permissions.self ? 'Request time off' : 'Record time off'}
          description={`Add time off for ${detail.fields.fullName}.`}
          dirty={
            !!start ||
            !!end ||
            !!reason ||
            !!attachment ||
            duration !== 'Full day' ||
            type !== 'Annual leave'
          }
          busy={busy}
          onClose={() => setMode(null)}
          footer={
            <>
              <Button data-dialog-close className="secondary" disabled={busy}>
                Cancel
              </Button>
              <Button
                busy={busy}
                disabled={!start || !end}
                onClick={() =>
                  void run(
                    'employee/leave',
                    {
                      requestId,
                      type,
                      startDate: start,
                      endDate: end,
                      duration,
                      reason,
                      attachmentId: attachment || undefined,
                    },
                    detail.permissions.self ? 'Leave request submitted.' : 'Time off recorded.',
                  )
                }
              >
                {detail.permissions.self ? 'Submit request' : 'Record time off'}
              </Button>
            </>
          }
        >
          <Notice>{error}</Notice>
          <fieldset className="detail-fields" disabled={busy}>
            <SelectField
              label="Leave type"
              value={type}
              placeholder="Select leave type"
              options={[...leaveTypes]}
              onChange={setType}
            />
            <div className="detail-two-fields">
              <Field
                label="Start date"
                type="date"
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
              <Field
                label="End date"
                type="date"
                required
                min={start}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
            <SelectField
              label="Duration"
              value={duration}
              options={['Full day', 'Half day']}
              placeholder="Select duration"
              onChange={setDuration}
            />
            <label className="detail-textarea">
              Reason
              <textarea
                value={reason}
                maxLength={2000}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Add a note (optional)"
              />
            </label>
            {documents.length > 0 && (
              <SelectField
                label="Attachment"
                required={false}
                value={documents.find((d) => d.id === attachment)?.title || 'None'}
                options={['None', ...documents.map((d) => d.title)]}
                placeholder="Optional employee document"
                onChange={(v) => setAttachment(documents.find((d) => d.title === v)?.id || '')}
              />
            )}
            <div className="detail-balance">
              <div>
                <strong>
                  {start && end && end >= start ? leaveDays(start, end, duration) : 0} days
                </strong>
                <span>Requested days</span>
              </div>
              <div>
                <strong>{balance}</strong>
                <span>Current balance</span>
              </div>
            </div>
            <p className="hint">
              Working days: Monday–Friday.{' '}
              {detail.permissions.self
                ? 'Your request will be reviewed.'
                : 'Recorded time off is approved immediately and appears in the employee’s leave history.'}
            </p>
          </fieldset>
        </DetailDialog>
      )}
      {mode === 'allowance' && (
        <DetailDialog
          title="Set leave allowance"
          description="Set the employee’s total allowance for the year. Approved leave is deducted automatically."
          onClose={() => setMode(null)}
          dirty={!!days}
          busy={busy}
          footer={
            <>
              <Button data-dialog-close className="secondary">
                Cancel
              </Button>
              <Button
                busy={busy}
                disabled={days === ''}
                onClick={() =>
                  void run(
                    'employee/allowance',
                    { year: Number(year), type, days: Number(days) },
                    'Leave allowance saved.',
                  )
                }
              >
                Save changes
              </Button>
            </>
          }
        >
          <Notice>{error}</Notice>
          <div className="detail-fields">
            <SelectField
              label="Leave type"
              value={type}
              options={leaveTypes.filter((t) => t !== 'Unpaid leave')}
              onChange={setType}
              placeholder="Choose type"
            />
            <Field
              label="Year"
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
            <Field
              label="Annual allowance (days)"
              type="number"
              min={0}
              max={366}
              step={0.5}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </div>
        </DetailDialog>
      )}
      {mode === 'request' && selected && (
        <DetailDialog
          title="Leave request"
          narrow
          onClose={() => setMode(null)}
          busy={busy}
          footer={
            selected.status === 'pending' && detail.permissions.review ? (
              <>
                <Button
                  className="secondary"
                  onClick={() => {
                    setReason('')
                    setMode('reject')
                  }}
                >
                  Reject
                </Button>
                <Button
                  busy={busy}
                  onClick={() =>
                    void run(
                      'employee/leave-review',
                      { requestId: selected.id, action: 'approve' },
                      'Request approved.',
                    )
                  }
                >
                  Approve
                </Button>
              </>
            ) : ['pending', 'approved'].includes(selected.status) &&
              (detail.permissions.edit || detail.permissions.self) ? (
              <Button className="secondary" onClick={() => setMode('cancel')}>
                Cancel leave
              </Button>
            ) : undefined
          }
        >
          <Notice>{error}</Notice>
          <div className="detail-balance">
            <div>
              <strong>{selected.halfDays / 2}d</strong>
              <span>Requested days</span>
            </div>
            <div>
              <strong>
                {selected.type === 'Unpaid leave'
                  ? 'Not limited'
                  : requestBalance
                    ? `${(requestBalance.halfDays - requestBalance.usedHalfDays) / 2}d`
                    : 'Not set'}
              </strong>
              <span>Available balance</span>
            </div>
          </div>
          <dl className="detail-request-data">
            {[
              ['Leave policy', selected.type],
              ['Submitted', formatDate(String(selected.createdAt))],
              ['Dates', `${formatDate(selected.startDate)} → ${formatDate(selected.endDate)}`],
              ['Duration', selected.duration],
              ['Status', selected.status],
              ['Reason', selected.reason || 'Not provided'],
              ...(selected.rejectionReason ? [['Rejection reason', selected.rejectionReason]] : []),
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {selected.attachmentId && (
            <a
              className="button secondary"
              target="_blank"
              rel="noreferrer"
              href={
                documents.find((d) => d.id === selected.attachmentId)?.url ||
                `/api/app/employee/document-file?workspaceId=${workspaceId}&id=${detail.id}&documentId=${selected.attachmentId}`
              }
            >
              View attachment
            </a>
          )}
        </DetailDialog>
      )}
      {(mode === 'reject' || mode === 'cancel') && selected && (
        <DetailDialog
          title={mode === 'reject' ? 'Reject this request?' : 'Cancel this leave?'}
          description={
            mode === 'reject'
              ? 'The employee can view your decision and reason in their leave history.'
              : 'This removes the leave from approved totals and restores any deducted balance.'
          }
          onClose={() => setMode('request')}
          busy={busy}
          dirty={mode === 'reject' && !!reason}
          footer={
            <>
              <Button data-dialog-close className="secondary">
                Keep request
              </Button>
              <Button
                busy={busy}
                className="danger"
                disabled={mode === 'reject' && !reason.trim()}
                onClick={() =>
                  void run(
                    'employee/leave-review',
                    {
                      requestId: selected.id,
                      action: mode === 'reject' ? 'reject' : 'cancel',
                      reason,
                    },
                    mode === 'reject' ? 'Request rejected.' : 'Leave cancelled.',
                  )
                }
              >
                {mode === 'reject' ? 'Reject request' : 'Cancel leave'}
              </Button>
            </>
          }
        >
          <Notice>{error}</Notice>
          {mode === 'reject' && (
            <label className="detail-textarea">
              Reason <span className="required">*</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why the request is being rejected"
                maxLength={2000}
              />
            </label>
          )}
        </DetailDialog>
      )}
    </>
  )
}
