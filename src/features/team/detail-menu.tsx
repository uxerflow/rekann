import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Row actions escape the horizontally scrolling table while retaining focus. */
export function DetailMenu({
  anchor,
  onClose,
  children,
}: {
  anchor: HTMLElement
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const menu = ref.current!
    const box = anchor.getBoundingClientRect()
    menu.style.left = `${Math.max(8, Math.min(box.right - 200, innerWidth - 208))}px`
    menu.style.top = `${Math.max(8, Math.min(box.bottom + 8, innerHeight - menu.offsetHeight - 8))}px`
    menu.querySelector('button')?.focus()
    const dismiss = (event: PointerEvent) => {
      if (!menu.contains(event.target as Node) && !anchor.contains(event.target as Node)) onClose()
    }
    const reposition = () => onClose()
    document.addEventListener('pointerdown', dismiss)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('resize', reposition)
      if (anchor.isConnected) anchor.focus()
    }
  }, [anchor, onClose])
  return createPortal(
    <div
      ref={ref}
      className="detail-menu detail-menu-portal"
      role="group"
      aria-label="Document actions"
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
    document.body,
  )
}
