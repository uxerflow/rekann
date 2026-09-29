import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { DetailMenu } from '../features/team/detail-menu'
import { addDays } from '../shared/leaves'
import './date-picker.css'

type Mode = 'day' | 'week' | 'month' | 'year' | 'range'
const iso = (date: Date) => date.toISOString().slice(0, 10)
const monthOf = (date: string) => date.slice(0, 7) + '-01'
const monday = (date: string) => addDays(date, -((new Date(date).getUTCDay() + 6) % 7))
const valid = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(Date.parse(date)) &&
  iso(new Date(date)) === date
const format = (
  date: string,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
) =>
  valid(date)
    ? new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' }).format(new Date(date))
    : 'Select date'

type Props = {
  label: string
  value: string
  endValue?: string
  mode?: Mode
  onChange: (start: string, end: string) => void
  today?: string
  min?: string
  disabled?: boolean
  required?: boolean
  compact?: boolean
}

/** Workspace dates are calendar strings, never converted through the browser's time zone. */
export function DatePicker({ mode = 'day', today = iso(new Date()), ...props }: Props) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  const close = useCallback(() => setAnchor(null), [])
  const id = useId()
  let display = format(props.value)
  if (valid(props.value)) {
    if (mode === 'range') display += ` – ${format(props.endValue ?? '')}`
    if (mode === 'week')
      display = `${format(monday(props.value), { month: 'short', day: 'numeric' })} – ${format(addDays(monday(props.value), 6))}`
    if (mode === 'month') display = format(props.value, { month: 'short', year: 'numeric' })
    if (mode === 'year') display = props.value.slice(0, 4)
  }
  return (
    <div className={props.compact ? 'date-field date-field-compact' : 'field date-field'}>
      {!props.compact && (
        <label htmlFor={id}>
          {props.label}
          {props.required && <span className="date-required"> *</span>}
        </label>
      )}
      <button
        id={id}
        type="button"
        className="date-trigger"
        disabled={props.disabled}
        aria-label={`${props.label}: ${display}`}
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        <span>{display}</span>
        <CalendarDays size={16} strokeWidth={1.5} />
      </button>
      {anchor && <DatePanel {...props} mode={mode} today={today} anchor={anchor} onClose={close} />}
    </div>
  )
}

function DatePanel({
  mode = 'day',
  today,
  value,
  endValue = '',
  min = '1900-01-01',
  onChange,
  anchor,
  onClose,
  label,
}: Props & { today: string; anchor: HTMLElement; onClose: () => void }) {
  const initial = valid(value) ? value : today < min ? min : today
  const [month, setMonth] = useState(monthOf(initial))
  const [view, setView] = useState<Mode>(mode)
  const [start, setStart] = useState(value)
  const [end, setEnd] = useState(endValue)
  const [hover, setHover] = useState('')
  const [focus, setFocus] = useState(initial)
  const grid = useRef<HTMLDivElement>(null)
  const moveFocus = useRef(false)
  const year = Number(month.slice(0, 4))
  const [decade, setDecade] = useState(Math.floor(Number(initial.slice(0, 4)) / 10) * 10)
  const rangeEnd = valid(end) ? end : hover >= start ? hover : start
  const selectedStart = mode === 'week' ? monday(initial) : start
  const selectedEnd = mode === 'week' ? addDays(selectedStart, 6) : rangeEnd
  const rangeValid = valid(start) && valid(end) && start >= min && end >= start
  const error =
    (start && !valid(start)) || (end && !valid(end))
      ? 'Enter a date as YYYY-MM-DD.'
      : valid(start) && start < min
        ? `Choose ${format(min)} or later.`
        : valid(start) && valid(end) && end < start
          ? 'End date must be on or after start date.'
          : ''
  useLayoutEffect(() => {
    if (moveFocus.current) {
      grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focus}"]`)?.focus()
      moveFocus.current = false
    }
  }, [focus, month, view])
  function commit(date: string, last = date) {
    onChange(date, last)
    onClose()
  }
  function choose(date: string) {
    if (mode !== 'range') {
      commit(mode === 'week' ? monday(date) : date)
      return
    }
    if (!valid(start) || end || date < start) {
      setStart(date)
      setEnd('')
      setHover('')
    } else setEnd(date)
  }
  function shift(amount: number) {
    const d = new Date(month)
    if (view === 'year') {
      const next = decade + amount * 12
      if (next >= 1900 && next <= 9988) setDecade(next)
      return
    }
    if (view === 'month') d.setUTCFullYear(year + amount)
    else d.setUTCMonth(d.getUTCMonth() + amount)
    if (d.getUTCFullYear() >= 1900 && d.getUTCFullYear() <= 9999) setMonth(iso(d))
  }
  return (
    <DetailMenu
      anchor={anchor}
      onClose={onClose}
      label={label}
      width={304}
      className="date-popover"
    >
      <div role="dialog" aria-label={`Choose ${label.toLowerCase()}`}>
        <header className="date-navigation">
          <button type="button" aria-label="Previous period" onClick={() => shift(-1)}>
            <ChevronLeft size={16} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            className="date-heading"
            onClick={() => {
              setDecade(Math.floor(year / 10) * 10)
              setView(view === 'year' ? 'month' : 'year')
            }}
          >
            {view === 'year'
              ? `${decade} – ${decade + 11}`
              : view === 'month'
                ? year
                : format(month, { month: 'long', year: 'numeric' })}
          </button>
          <button type="button" aria-label="Next period" onClick={() => shift(1)}>
            <ChevronRight size={16} strokeWidth={1.5} />
          </button>
        </header>
        {mode === 'range' && (
          <div className="date-range-fields">
            <label>
              Start date
              <input
                aria-label="Start date"
                placeholder="YYYY-MM-DD"
                value={start}
                maxLength={10}
                aria-invalid={!!error}
                onChange={(e) => {
                  setStart(e.target.value)
                  if (valid(e.target.value)) setMonth(monthOf(e.target.value))
                }}
              />
            </label>
            <label>
              End date
              <input
                aria-label="End date"
                placeholder="YYYY-MM-DD"
                value={end}
                maxLength={10}
                aria-invalid={!!error}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
          </div>
        )}
        {view === 'month' || view === 'year' ? (
          <div
            className="date-choices"
            onKeyDown={(e) => {
              const items = Array.from(
                e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
              )
              const current = items.indexOf(document.activeElement as HTMLButtonElement)
              const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[e.key]
              if (delta === undefined) return
              e.preventDefault()
              e.stopPropagation()
              items[Math.max(0, Math.min(items.length - 1, current + delta))]?.focus()
            }}
          >
            {Array.from({ length: 12 }, (_, i) => {
              const date =
                view === 'year'
                  ? `${decade + i}-01-01`
                  : `${year}-${String(i + 1).padStart(2, '0')}-01`
              const selected =
                value.slice(0, view === 'year' ? 4 : 7) === date.slice(0, view === 'year' ? 4 : 7)
              const endOfPeriod =
                view === 'year' ? `${decade + i}-12-31` : iso(new Date(Date.UTC(year, i + 1, 0)))
              return (
                <button
                  type="button"
                  key={date}
                  disabled={endOfPeriod < min || Number(date.slice(0, 4)) > 9999}
                  aria-pressed={selected}
                  data-initial-focus={selected || undefined}
                  onClick={() => {
                    if (view === mode) commit(date < min ? min : date)
                    else {
                      setMonth(date)
                      if (view === 'month') {
                        moveFocus.current = true
                        setFocus(date < min ? min : date)
                      }
                      setView(view === 'year' ? 'month' : mode)
                    }
                  }}
                >
                  {view === 'year' ? decade + i : format(date, { month: 'short' })}
                </button>
              )
            })}
          </div>
        ) : (
          <>
            <div className="date-weekdays" aria-hidden="true">
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="date-grid" ref={grid} onPointerLeave={() => setHover('')}>
              {Array.from(
                {
                  length:
                    Math.ceil(
                      (((new Date(month).getUTCDay() + 6) % 7) +
                        new Date(Date.UTC(year, Number(month.slice(5, 7)), 0)).getUTCDate()) /
                        7,
                    ) * 7,
                },
                (_, i) => {
                  const date = addDays(monday(month), i)
                  const inside =
                    date >= selectedStart &&
                    date <= selectedEnd &&
                    (mode === 'week' || mode === 'range')
                  const first = inside && date === selectedStart,
                    last = inside && date === selectedEnd
                  const single = mode === 'day' && date === value
                  return (
                    <button
                      key={date}
                      type="button"
                      data-date={date}
                      data-initial-focus={date === focus || undefined}
                      tabIndex={
                        date ===
                        (focus.slice(0, 7) === month.slice(0, 7)
                          ? focus
                          : month < min
                            ? min
                            : month)
                          ? 0
                          : -1
                      }
                      disabled={date < min}
                      aria-label={format(date)}
                      aria-pressed={inside || single}
                      aria-current={date === today ? 'date' : undefined}
                      className={`date-day ${date.slice(0, 7) !== month.slice(0, 7) ? 'outside' : ''} ${inside ? 'in-range' : ''} ${first ? 'range-start' : ''} ${last ? 'range-end' : ''} ${single || (first && last) ? 'single' : ''}`}
                      onPointerEnter={() => {
                        if (!end) setHover(date)
                      }}
                      onClick={() => choose(date)}
                      onKeyDown={(e) => {
                        let next = date
                        if (e.key === 'ArrowLeft') next = addDays(date, -1)
                        else if (e.key === 'ArrowRight') next = addDays(date, 1)
                        else if (e.key === 'ArrowUp') next = addDays(date, -7)
                        else if (e.key === 'ArrowDown') next = addDays(date, 7)
                        else if (e.key === 'Home') next = monday(date)
                        else if (e.key === 'End') next = addDays(monday(date), 6)
                        else return
                        e.preventDefault()
                        e.stopPropagation()
                        if (next < min || next > '9999-12-31') return
                        moveFocus.current = true
                        setFocus(next)
                        setMonth(monthOf(next))
                        if (!end) setHover(next)
                      }}
                    >
                      {Number(date.slice(8))}
                    </button>
                  )
                },
              )}
            </div>
          </>
        )}
        {error && mode === 'range' && (
          <p className="date-error" role="alert">
            {error}
          </p>
        )}
        <footer className="date-actions">
          {mode === 'range' ? (
            <>
              <button type="button" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="date-apply"
                disabled={!rangeValid}
                onClick={() => commit(start, end)}
              >
                Apply
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={today < min}
              onClick={() =>
                commit(
                  mode === 'week'
                    ? monday(today)
                    : mode === 'month'
                      ? monthOf(today)
                      : mode === 'year'
                        ? `${today.slice(0, 4)}-01-01`
                        : today,
                )
              }
            >
              Today
            </button>
          )}
        </footer>
      </div>
    </DetailMenu>
  )
}
