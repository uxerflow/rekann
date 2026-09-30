import { useLayoutEffect, useRef, type ReactNode } from 'react'
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
  useLayoutEffect(() => {
    const menu = ref.current!
    menu.showPopover()
    function place() {
      const box = anchor.getBoundingClientRect()
      const menuWidth = Math.min(width, innerWidth - 16)
      menu.style.width = `${menuWidth}px`
      menu.style.maxHeight = `${innerHeight - 16}px`
      menu.style.left = `${Math.max(8, Math.min(box.right - menuWidth, innerWidth - menuWidth - 8))}px`
      const top =
        box.bottom + 8 + menu.offsetHeight <= innerHeight - 8
          ? box.bottom + 8
          : box.top - menu.offsetHeight - 8
      menu.style.top = `${Math.max(8, Math.min(top, innerHeight - menu.offsetHeight - 8))}px`
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(menu)
    const first =
      menu.querySelector<HTMLElement>('[data-initial-focus]') ??
      menu.querySelector('button') ??
      menu
    first.focus({ preventScroll: true })
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
      observer.disconnect()
      document.removeEventListener('scroll', scroll, true)
      document.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('resize', reposition)
      if (anchor.isConnected) anchor.focus()
    }
  }, [anchor, onClose, width])
  return createPortal(
    <div
      ref={ref}
      popover="manual"
      tabIndex={-1}
      className={`detail-menu detail-menu-portal ${className}`}
      role="group"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }
        if (
          !event.defaultPrevented &&
          !(
            event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
          ) &&
          ['ArrowDown', 'ArrowUp'].includes(event.key)
        ) {
          event.preventDefault()
          const items = Array.from(
            ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
          )
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
