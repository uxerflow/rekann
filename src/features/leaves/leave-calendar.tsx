import { useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { Avatar, Button, mediaUrl } from '../../components/ui'
import { SelectField } from '../../components/select-field'
import { ScrollArea } from '../../components/scroll-area'
import { DetailMenu } from '../team/detail-menu'
import { DetailDialog } from '../team/detail-dialog'
import { dayInZone } from '../../shared/employee-detail'
import { addDays, dateDays } from '../../shared/leaves'
import type { AdminLeaves, LeaveRequest } from '../../server/leaves'
import { daysText, prettyDate } from './leave-dialogs'

const monthName = (date: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(date),
  )
const monday = (date: string) => addDays(date, -((new Date(date).getUTCDay() + 6) % 7))
const tone = (name: string) =>
  /unpaid/i.test(name)
    ? 'red'
    : /sick|medical/i.test(name)
      ? 'gray'
      : /patern/i.test(name)
        ? 'blue'
        : /matern|closure|holiday/i.test(name)
          ? 'orange'
          : 'purple'
type CalendarEvent = {
  id: string
  name: string
  start: string
  end: string
  memberId?: string
  pending: boolean
  request?: LeaveRequest
  countAs: string
  coveredIds?: string[]
}
export function LeaveCalendar({
  state,
  onRequest,
  onRequests,
}: {
  state: AdminLeaves
  onRequest: (r: LeaveRequest) => void
  onRequests: () => void
}) {
  const [mode, setMode] = useState('Week'),
    [date, setDate] = useState(state.today),
    [sidebar, setSidebar] = useState(true),
    [day, setDay] = useState<string | null>(null),
    [event, setEvent] = useState<CalendarEvent | null>(null)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const closeEvent = useCallback(() => setEvent(null), [])
  const events: CalendarEvent[] = [
    ...state.requests
      .filter((r) => ['approved', 'pending'].includes(r.status))
      .map((r) => ({
        id: r.id,
        name: r.type,
        start: r.startDate,
        end: r.endDate,
        memberId: r.memberId,
        pending: r.status === 'pending',
        request: r,
        countAs: r.policyRules?.countAs || 'Working days',
      })),
    ...state.policies
      .filter((p) => p.kind === 'closure' && p.active)
      .map((p) => ({
        id: p.id,
        name: p.name,
        start: p.rules.startDate,
        end: p.rules.endDate,
        pending: false,
        countAs: p.rules.countAs,
        coveredIds: p.coveredMemberIds,
      })),
  ]
  const pending = state.requests.filter((r) => r.status === 'pending')
  const at = (d: string) =>
    events.filter(
      (e) => e.start <= d && e.end >= d && dateDays(e.start, e.end, e.countAs).includes(d),
    )
  function navigate(delta: number) {
    if (mode === 'Week') {
      setDate(addDays(date, delta * 14))
      return
    }
    const d = new Date(date)
    d.setUTCDate(1)
    if (mode === 'Month') d.setUTCMonth(d.getUTCMonth() + delta)
    else d.setUTCFullYear(d.getUTCFullYear() + delta)
    setDate(d.toISOString().slice(0, 10))
  }
  function chip(e: CalendarEvent, compact = false) {
    const p = state.people.find((p) => p.id === e.memberId)
    return (
      <button
        type="button"
        className={`leave-chip tone-${tone(e.name)} ${e.pending ? 'leave-pending' : ''}`}
        aria-label={`${p?.name || 'Company'} · ${e.name}${e.pending ? ' · Pending' : ''}`}
        onClick={(click) => {
          setAnchor(click.currentTarget)
          setEvent(e)
        }}
      >
        {compact && p && <Avatar name={p.name} image={mediaUrl(p.avatarKey)} />}
        <span>{e.name}</span>
      </button>
    )
  }
  function monthGrid(month: string, mini = false) {
    const first = `${month.slice(0, 7)}-01`,
      start = monday(first),
      last = new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 0))
        .toISOString()
        .slice(0, 10)
    const count =
      Math.ceil((Math.round((Date.parse(last) - Date.parse(start)) / 86400000) + 1) / 7) * 7
    const days = Array.from({ length: count }, (_, i) => addDays(start, i))
    if (mini)
      return (
        <div className="leave-mini-days">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((v, i) => (
            <span key={i}>{v}</span>
          ))}
          {days.map((d) => (
            <button
              key={d}
              className={`${d === state.today ? 'is-today' : ''} ${at(d).length ? 'has-leave' : ''}`}
              disabled={!d.startsWith(month.slice(0, 7))}
              aria-label={`${prettyDate(d)}, ${at(d).length} events`}
              onClick={() => {
                setDate(d)
                setMode('Month')
              }}
            >
              {d.startsWith(month.slice(0, 7)) ? Number(d.slice(8)) : ' '}
            </button>
          ))}
        </div>
      )
    return (
      <div className="leave-month">
        <div className="leave-weekdays">
          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(
            (v) => (
              <span key={v}>{v}</span>
            ),
          )}
        </div>
        {Array.from({ length: count / 7 }, (_, i) => {
          const week = days.slice(i * 7, i * 7 + 7)
          const items = events.filter((e) => e.start <= week[6] && e.end >= week[0])
          const lanes: string[][] = []
          const segments: { e: CalendarEvent; start: number; end: number; lane: number }[] = []
          for (const e of items) {
            let index = 0
            while (index < 7) {
              if (!at(week[index]).some((x) => x.id === e.id)) {
                index++
                continue
              }
              const from = index
              while (index < 6 && at(week[index + 1]).some((x) => x.id === e.id)) index++
              const to = index
              let lane = 0
              while (lanes[lane]?.slice(from, to + 1).some(Boolean)) lane++
              lanes[lane] ??= Array(7).fill('')
              for (let d = from; d <= to; d++) lanes[lane][d] = e.id
              segments.push({ e, start: from, end: to, lane })
              index++
            }
          }
          return (
            <div className="leave-month-week" key={week[0]}>
              {week.map((d) => (
                <button
                  key={d}
                  className={`leave-day-cell ${d.slice(0, 7) !== month.slice(0, 7) ? 'outside-month' : ''}`}
                  aria-label={`View leaves on ${prettyDate(d)}`}
                  onClick={() => setDay(d)}
                >
                  <time className={d === state.today ? 'is-today' : ''}>{Number(d.slice(8))}</time>
                </button>
              ))}
              <div className="leave-month-events">
                {segments
                  .filter((s) => s.lane < 2)
                  .map((s) => (
                    <div
                      key={`${s.e.id}-${s.start}`}
                      style={{ gridColumn: `${s.start + 1} / ${s.end + 2}`, gridRow: s.lane + 1 }}
                    >
                      {chip(s.e, true)}
                    </div>
                  ))}
                {week.map((d, idx) => {
                  const hidden = segments.filter(
                    (s) => s.lane >= 2 && s.start <= idx && s.end >= idx,
                  ).length
                  return hidden ? (
                    <button
                      className="leave-more"
                      key={d}
                      style={{ gridColumn: idx + 1, gridRow: 3 }}
                      onClick={() => setDay(d)}
                    >
                      +{hidden} more
                    </button>
                  ) : null
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }
  const weekStart = monday(date),
    weekDays = Array.from({ length: 14 }, (_, i) => addDays(weekStart, i))
  return (
    <div className={`leave-calendar-layout ${sidebar ? '' : 'pending-hidden'}`}>
      <section className="leave-calendar-main">
        <div className="leave-calendar-toolbar">
          <strong>{mode === 'Year' ? date.slice(0, 4) : monthName(date)}</strong>
          <div>
            <button
              className="icon-button"
              aria-label={`Previous ${mode.toLowerCase()}`}
              onClick={() => navigate(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              className="icon-button"
              aria-label={`Next ${mode.toLowerCase()}`}
              onClick={() => navigate(1)}
            >
              <ChevronRight size={16} />
            </button>
            <label className="leave-date-control" data-mode={mode}>
              <span>
                {mode === 'Week'
                  ? `${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(weekStart))} – ${new Intl.DateTimeFormat('en', { month: weekStart.slice(0, 7) === weekDays[13].slice(0, 7) ? undefined : 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(weekDays[13]))}, ${weekStart.slice(0, 4)}`
                  : mode === 'Year'
                    ? date.slice(0, 4)
                    : new Intl.DateTimeFormat('en', {
                        month: 'short',
                        year: 'numeric',
                        timeZone: 'UTC',
                      }).format(new Date(date))}
              </span>
              <img src="/leaves/date.svg" width={16} height={16} alt="" />
              <input
                aria-label="Calendar date"
                type={mode === 'Week' ? 'date' : 'month'}
                value={mode === 'Week' ? date : date.slice(0, 7)}
                onChange={(e) => {
                  if (e.target.value)
                    setDate(mode === 'Week' ? e.target.value : `${e.target.value}-01`)
                }}
              />
            </label>
            <SelectField
              compact
              required={false}
              label="Calendar view"
              placeholder="Week"
              value={mode}
              options={['Week', 'Month', 'Year']}
              onChange={setMode}
            />
            {!sidebar && (
              <button
                className="icon-button"
                aria-label="Show pending requests"
                onClick={() => setSidebar(true)}
              >
                <PanelRightOpen size={16} />
              </button>
            )}
          </div>
        </div>
        <ScrollArea className="leave-calendar-scroll" type="auto">
          {mode === 'Week' ? (
            <div className="leave-timeline-scroll">
              <div className="leave-timeline">
                <div className="leave-timeline-background" aria-hidden="true">
                  {weekDays.map((d) => (
                    <div
                      key={d}
                      className={`leave-track-day ${[0, 6].includes(new Date(d).getUTCDay()) ? 'weekend' : ''} ${d === state.today ? 'today-column' : ''}`}
                    />
                  ))}
                </div>
                <div className="leave-timeline-header">
                  <span>People</span>
                  <div>
                    <small>{monthName(date)}</small>
                    <div className="leave-timeline-dates">
                      {weekDays.map((d) => (
                        <button
                          className={d === state.today ? 'is-today' : ''}
                          key={d}
                          aria-label={prettyDate(d)}
                          onClick={() => setDay(d)}
                        >
                          {Number(d.slice(8))}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="leave-timeline-body">
                  {state.people
                    .filter((p) => p.active)
                    .map((p) => (
                      <div className="leave-timeline-row" key={p.id}>
                        <div className="leave-person">
                          <Avatar name={p.name} image={mediaUrl(p.avatarKey)} />
                          <div>
                            <strong>{p.name}</strong>
                            <span>{p.jobTitle || 'Employee'}</span>
                          </div>
                        </div>
                        <div className="leave-timeline-track">
                          {weekDays.map((d) => (
                            <div
                              className={`leave-track-day ${[0, 6].includes(new Date(d).getUTCDay()) ? 'weekend' : ''} ${d === state.today ? 'today-column' : ''}`}
                              key={d}
                            />
                          ))}
                          {events
                            .filter(
                              (e) =>
                                (e.memberId === p.id || e.coveredIds?.includes(p.id)) &&
                                e.start <= weekDays[13] &&
                                e.end >= weekStart,
                            )
                            .map((e) => {
                              const start = Math.max(
                                  0,
                                  Math.round(
                                    (Date.parse(e.start) - Date.parse(weekStart)) / 86400000,
                                  ),
                                ),
                                end = Math.min(
                                  13,
                                  Math.round(
                                    (Date.parse(e.end) - Date.parse(weekStart)) / 86400000,
                                  ),
                                )
                              return (
                                <div
                                  className="leave-timeline-event"
                                  key={e.id}
                                  style={{
                                    left: `calc(${(start / 14) * 100}% + 4px)`,
                                    width: `calc(${((end - start + 1) / 14) * 100}% - 8px)`,
                                  }}
                                >
                                  {chip(e)}
                                </div>
                              )
                            })}
                        </div>
                      </div>
                    ))}
                </div>
                {!events.some((e) => e.start <= weekDays[13] && e.end >= weekStart) && (
                  <p className="leave-calendar-empty">No leave this week. Everyone is available.</p>
                )}
              </div>
            </div>
          ) : mode === 'Month' ? (
            monthGrid(date)
          ) : (
            <div className="leave-year">
              {Array.from({ length: 12 }, (_, i) => {
                const m = `${date.slice(0, 4)}-${String(i + 1).padStart(2, '0')}-01`
                const count = events.filter(
                  (e) => e.start <= `${m.slice(0, 7)}-31` && e.end >= m,
                ).length
                return (
                  <section className="leave-mini-month" key={m}>
                    <button
                      className="text-button"
                      onClick={() => {
                        setDate(m)
                        setMode('Month')
                      }}
                    >
                      {monthName(m).split(' ')[0]}
                    </button>
                    {monthGrid(m, true)}
                    <small>
                      {count ? `${count} ${count === 1 ? 'event' : 'events'}` : 'No events'}
                    </small>
                  </section>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </section>
      {sidebar && (
        <aside className="leave-pending-panel">
          <header>
            <span>Pending Request</span>
            <button
              className="icon-button"
              aria-label="Hide pending requests"
              onClick={() => setSidebar(false)}
            >
              <PanelRightClose size={16} />
            </button>
          </header>
          <ScrollArea className="leave-pending-scroll" type="auto">
            <div className="leave-pending-list">
              {!pending.length ? (
                <div className="leave-pending-empty">
                  <img src="/dashboard/reports-empty.svg" alt="" />
                  <h3>All caught up</h3>
                  <p>New leave requests will appear here.</p>
                </div>
              ) : (
                <>
                  {['Today', 'Earlier'].map((group) => {
                    const rows = pending.filter(
                      (r) =>
                        (dayInZone(new Date(r.createdAt), state.timeZone) === state.today) ===
                        (group === 'Today'),
                    )
                    return rows.length ? (
                      <section key={group}>
                        <h3>{group}</h3>
                        {rows.map((r) => {
                          const p = state.people.find((p) => p.id === r.memberId)!
                          return (
                            <button
                              className="leave-pending-card"
                              key={r.id}
                              onClick={() => onRequest(r)}
                            >
                              <Avatar name={p.name} image={mediaUrl(p.avatarKey)} />
                              <span>
                                <strong>{p.name}</strong>
                                <small>
                                  {r.type} · {daysText(r.halfDays / 2)}
                                </small>
                              </span>
                            </button>
                          )
                        })}
                      </section>
                    ) : null
                  })}
                  <Button className="secondary" onClick={onRequests}>
                    See detail request
                  </Button>
                </>
              )}
            </div>
          </ScrollArea>
        </aside>
      )}
      {day && (
        <DetailDialog title={prettyDate(day)} onClose={() => setDay(null)}>
          <div className="leave-day-list">
            {at(day).length ? (
              at(day).map((e) => <div key={e.id}>{chip(e, true)}</div>)
            ) : (
              <p>No leave on this day.</p>
            )}
          </div>
        </DetailDialog>
      )}
      {event && anchor && (
        <DetailMenu
          anchor={anchor}
          onClose={closeEvent}
          label={event.name}
          width={270}
          className="leave-event-popover"
        >
          <strong>{event.name}</strong>
          <p>
            {event.memberId
              ? state.people.find((p) => p.id === event.memberId)?.name
              : 'Company closure'}
          </p>
          <p>
            {prettyDate(event.start)} → {prettyDate(event.end)}
          </p>
          <small>
            {event.pending
              ? 'Pending approval'
              : event.request
                ? 'Approved'
                : `${event.coveredIds?.length ?? 0} members covered`}
          </small>
          {event.request && (
            <button
              onClick={() => {
                onRequest(event.request!)
                setEvent(null)
                setDay(null)
              }}
            >
              View request
            </button>
          )}
        </DetailMenu>
      )}
    </div>
  )
}
