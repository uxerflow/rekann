import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Row actions escape the horizontally scrolling table while retaining focus. */
export function DetailMenu({
  anchor,
  onClose,
  children,
  width = 200,
  label = 'Document actions',
  className = '',
}: {
  anchor: HTMLElement
  onClose: () => void
  children: ReactNode
  width?: number
  label?: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const menu = ref.current!
    const box = anchor.getBoundingClientRect()
    const dialog = anchor.closest('dialog')
    const origin = dialog?.getBoundingClientRect()
    const offsetX = origin ? origin.left + (dialog?.clientLeft ?? 0) : 0
    const offsetY = origin ? origin.top + (dialog?.clientTop ?? 0) : 0
    menu.style.width = `${Math.min(width, innerWidth - 16)}px`
    menu.style.left = `${Math.max(8, Math.min(box.right - width, innerWidth - width - 8)) - offsetX}px`
    menu.style.top = `${Math.max(8, Math.min(box.bottom + 8, innerHeight - menu.offsetHeight - 8)) - offsetY}px`
    const first = menu.querySelector('button') ?? menu
    first.focus()
    const dismiss = (event: PointerEvent) => {
      if (!menu.contains(event.target as Node) && !anchor.contains(event.target as Node)) onClose()
    }
    const reposition = () => onClose()
    const scroll = (event: Event) => {
      if (!menu.contains(event.target as Node)) onClose()
    }
    document.addEventListener('scroll', scroll, true)
    document.addEventListener('pointerdown', dismiss)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('scroll', scroll, true)
      document.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('resize', reposition)
      if (anchor.isConnected) anchor.focus()
    }
  }, [anchor, onClose, width])
  return createPortal(
    <div
      ref={ref}
      tabIndex={-1}
      className={`detail-menu detail-menu-portal ${className}`}
      role="group"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
          event.preventDefault()
          const items = Array.from(ref.current!.querySelectorAll('button'))
          const next =
            (items.indexOf(document.activeElement as HTMLButtonElement) +
              (event.key === 'ArrowDown' ? 1 : -1) +
              items.length) %
            items.length
          items[next]?.focus()
        }
      }}
    >
      {children}
    </div>,
    anchor.closest('dialog') ?? document.body,
  )
}
