import { useEffect, useLayoutEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, Search, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { spring } from '../lib/motion'
import { ScrollArea } from './scroll-area'
import { useHydrated } from './ui'

const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

export function SelectField({
  label,
  placeholder,
  value,
  options,
  onChange,
  searchable = false,
  disabled = false,
}: {
  label: string
  placeholder: string
  value: string
  options: readonly string[]
  onChange: (value: string) => void
  searchable?: boolean
  disabled?: boolean
}) {
  const id = useId()
  const ready = useHydrated()
  const trigger = useRef<HTMLButtonElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const keyboardNavigation = useRef(false)
  const reduceMotion = useReducedMotion()
  const [highlight, setHighlight] = useState({ y: 0, height: 36 })
  const [hovering, setHovering] = useState(false)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 300 })
  const filtered = options.filter((option) => normalize(option).includes(normalize(query.trim())))

  function close(restoreFocus = false) {
    setOpen(false)
    if (restoreFocus) trigger.current?.focus()
  }
  function choose(option: string) {
    onChange(option)
    close(true)
  }
  function show() {
    if (trigger.current?.matches(':disabled')) return
    setQuery('')
    keyboardNavigation.current = true
    setHovering(false)
    setActive(Math.max(0, options.indexOf(value)))
    setOpen(true)
  }
  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const rect = trigger.current!.getBoundingClientRect()
      const viewport = window.visualViewport
      const bottom = (viewport?.height ?? window.innerHeight) + (viewport?.offsetTop ?? 0)
      const above = rect.top - (viewport?.offsetTop ?? 0) - 8
      const below = bottom - rect.bottom - 8
      const height = Math.min(300, Math.max(above, below) - 8)
      const up = below < Math.min(300, height) && above > below
      setPosition({
        left: rect.left,
        top: up ? rect.top - 8 : rect.bottom + 8,
        width: rect.width,
        maxHeight: Math.max(100, height),
      })
      popup.current?.setAttribute('data-side', up ? 'top' : 'bottom')
    }
    function outside(event: PointerEvent) {
      if (
        !popup.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        close()
    }
    function scrolled(event: Event) {
      if (!popup.current?.contains(event.target as Node)) place()
    }
    place()
    if (searchable) search.current?.focus({ preventScroll: true })
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', scrolled, true)
    window.visualViewport?.addEventListener('resize', place)
    return () => {
      document.removeEventListener('pointerdown', outside)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', scrolled, true)
      window.visualViewport?.removeEventListener('resize', place)
    }
  }, [open, searchable])
  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])
  useLayoutEffect(() => {
    if (!open) return
    const row = document.getElementById(`${id}-option-${active}`)
    if (row) {
      setHighlight({ y: row.offsetTop, height: row.offsetHeight })
      if (keyboardNavigation.current) {
        const viewport = row.closest<HTMLElement>('.scroll-viewport')
        if (viewport) {
          if (row.offsetTop < viewport.scrollTop) viewport.scrollTop = row.offsetTop
          else if (row.offsetTop + row.offsetHeight > viewport.scrollTop + viewport.clientHeight)
            viewport.scrollTop = row.offsetTop + row.offsetHeight - viewport.clientHeight
        }
      }
    }
  }, [active, open, id, query])

  function keyboard(event: KeyboardEvent) {
    if (event.nativeEvent.isComposing) return
    keyboardNavigation.current = true
    setHovering(true)
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      close(true)
    } else if (event.key === 'Tab') {
      // Return to the trigger before normal tab navigation leaves the widget.
      if (open) close(true)
    } else if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault()
      if (!open) show()
      else
        setActive((index) =>
          Math.max(0, Math.min(filtered.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))),
        )
    } else if (event.key === 'Enter' && open) {
      event.preventDefault()
      if (filtered[active]) choose(filtered[active])
    } else if (!searchable && open && ['Home', 'End'].includes(event.key)) {
      event.preventDefault()
      setActive(event.key === 'Home' ? 0 : filtered.length - 1)
    } else if (
      !searchable &&
      event.key.length === 1 &&
      event.key !== ' ' &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault()
      if (!open) show()
      const index = options.findIndex(
        (option, i) => i > active && normalize(option).startsWith(normalize(event.key)),
      )
      setActive(
        index >= 0
          ? index
          : Math.max(
              0,
              options.findIndex((option) => normalize(option).startsWith(normalize(event.key))),
            ),
      )
    }
  }
  return (
    <div className="field">
      <label id={`${id}-label`} htmlFor={id}>
        {label}
        <span className="required"> *</span>
      </label>
      <button
        id={id}
        ref={trigger}
        type="button"
        className="select-trigger"
        disabled={!ready || disabled}
        role={searchable ? undefined : 'combobox'}
        aria-required={searchable ? undefined : true}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-haspopup={searchable ? 'dialog' : 'listbox'}
        aria-expanded={open}
        aria-controls={open ? `${id}-${searchable ? 'popup' : 'list'}` : undefined}
        aria-activedescendant={
          !searchable && open && filtered[active] ? `${id}-option-${active}` : undefined
        }
        onClick={() => (open ? close() : show())}
        onKeyDown={keyboard}
      >
        <span id={`${id}-value`}>{value || placeholder}</span>
        <img src="/icons/chevron-down.svg" alt="" width={16} height={16} />
      </button>
      {ready &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={popup}
                id={`${id}-popup`}
                className="select-popup"
                style={position}
                initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: spring.moderate.exit }}
                transition={spring.moderate}
                role={searchable ? 'dialog' : undefined}
                aria-label={searchable ? `Choose ${label.toLowerCase()}` : undefined}
              >
                {searchable && (
                  <div className="select-search">
                    <Search size={16} aria-hidden="true" />
                    <input
                      ref={search}
                      role="combobox"
                      aria-label="Search countries"
                      placeholder="Search countries…"
                      aria-autocomplete="list"
                      aria-expanded={open}
                      aria-controls={`${id}-list`}
                      aria-activedescendant={
                        filtered[active] ? `${id}-option-${active}` : undefined
                      }
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value)
                        setActive(0)
                      }}
                      onKeyDown={keyboard}
                    />
                    {query && (
                      <button
                        type="button"
                        className="select-clear"
                        aria-label="Clear search"
                        tabIndex={-1}
                        onClick={() => {
                          setQuery('')
                          setActive(0)
                          search.current?.focus()
                        }}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                )}
                <ScrollArea>
                  <div
                    ref={list}
                    id={`${id}-list`}
                    role="listbox"
                    aria-label={label}
                    className="select-options"
                    onMouseLeave={() => setHovering(false)}
                    onMouseMove={(event) => {
                      const rows = Array.from(
                        list.current!.querySelectorAll<HTMLElement>('[role="option"]'),
                      )
                      let nearest = 0
                      let distance = Infinity
                      rows.forEach((row, index) => {
                        const rect = row.getBoundingClientRect()
                        const next = Math.abs(event.clientY - rect.top - rect.height / 2)
                        if (next < distance) {
                          distance = next
                          nearest = index
                        }
                      })
                      keyboardNavigation.current = false
                      setHovering(true)
                      setActive(nearest)
                    }}
                    onClick={(event) => {
                      if (event.target === event.currentTarget && filtered[active])
                        choose(filtered[active])
                    }}
                  >
                    <motion.div
                      aria-hidden="true"
                      className="select-highlight"
                      initial={false}
                      animate={{
                        y: highlight.y,
                        height: highlight.height,
                        opacity: hovering && filtered.length ? 1 : 0,
                      }}
                      transition={reduceMotion ? { duration: 0 } : spring.fast}
                    />
                    {filtered.map((option, index) => (
                      <div
                        key={option}
                        id={`${id}-option-${index}`}
                        role="option"
                        aria-selected={value === option}
                        className={`select-option ${active === index ? 'active' : ''}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => choose(option)}
                      >
                        <span>{option}</span>
                        {value === option && <Check size={16} aria-hidden="true" />}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                {searchable && (
                  <p role="status" className={filtered.length ? 'sr-only' : 'select-empty'}>
                    {filtered.length ? `${filtered.length} countries found` : 'No countries found'}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  )
}
