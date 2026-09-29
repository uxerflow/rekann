import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Notice } from '../../components/ui'

export function DetailToast({
  message,
  onDismiss,
  children,
  duration = 5000,
}: {
  message: string
  onDismiss: () => void
  children?: ReactNode
  duration?: number
}) {
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(onDismiss, duration)
    return () => clearTimeout(timer)
  }, [message, onDismiss, duration])
  if (!message) return null
  return createPortal(
    <div className="detail-toast">
      <Notice success>
        {message}
        {children}
        <button
          type="button"
          className="icon-button"
          aria-label="Dismiss notification"
          onClick={onDismiss}
        >
          <X size={16} />
        </button>
      </Notice>
    </div>,
    document.body,
  )
}
