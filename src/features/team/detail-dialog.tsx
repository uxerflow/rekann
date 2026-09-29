import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '../../components/ui'
import { ScrollArea } from '../../components/scroll-area'

export function DetailDialog({
  title,
  description,
  children,
  footer,
  onClose,
  dirty = false,
  busy = false,
  wide = false,
  narrow = false,
  className = '',
}: {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  dirty?: boolean
  busy?: boolean
  wide?: boolean
  narrow?: boolean
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  const [discard, setDiscard] = useState(false)
  useEffect(() => {
    const d = ref.current!
    d.showModal()
    return () => d.close()
  }, [])
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  function close() {
    if (busy) return
    if (dirty) setDiscard(true)
    else onClose()
  }
  return (
    <dialog
      ref={ref}
      className={`confirm-dialog detail-dialog ${className} ${wide ? 'detail-dialog-wide' : narrow ? 'detail-dialog-narrow' : ''}`}
      aria-labelledby={id}
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest('[data-dialog-close]')) {
          e.preventDefault()
          e.stopPropagation()
          close()
        }
      }}
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
    >
      <div className="detail-dialog-header">
        <h2 id={id}>{discard ? 'Discard your changes?' : title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dialog"
          disabled={busy}
          onClick={close}
        >
          <X size={16} />
        </button>
      </div>
      {discard ? (
        <>
          <p>Your changes have not been saved. Continue editing or discard them.</p>
          <div className="detail-dialog-footer">
            <Button className="secondary" onClick={() => setDiscard(false)}>
              Keep editing
            </Button>
            <Button className="danger" onClick={onClose}>
              Discard changes
            </Button>
          </div>
        </>
      ) : (
        <>
          {description && <p className="detail-dialog-description">{description}</p>}
          <ScrollArea className="detail-dialog-scroll">{children}</ScrollArea>
          {footer && <div className="detail-dialog-footer">{footer}</div>}
        </>
      )}
    </dialog>
  )
}
