import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

// Thin, persistent desktop affordance; scrolling remains native on touch.
export function ScrollArea({
  children,
  className = '',
  gutter = false,
  type = 'always',
}: {
  children: ReactNode
  className?: string
  gutter?: boolean
  type?: 'always' | 'auto'
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ top: false, bottom: false })
  function updateEdges() {
    const node = viewport.current
    if (!node) return
    const top = node.scrollTop > 1
    const bottom = node.scrollTop + node.clientHeight < node.scrollHeight - 1
    setEdges((previous) =>
      previous.top === top && previous.bottom === bottom ? previous : { top, bottom },
    )
  }
  useLayoutEffect(() => {
    updateEdges()
    const observer = new ResizeObserver(updateEdges)
    observer.observe(viewport.current!)
    if (viewport.current?.firstElementChild) observer.observe(viewport.current.firstElementChild)
    return () => observer.disconnect()
  }, [])
  return (
    <ScrollAreaPrimitive.Root
      className={`scroll-area ${className}`}
      type={type}
      data-gutter={gutter}
      data-overflow={edges.top || edges.bottom}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewport}
        className="scroll-viewport"
        onScroll={updateEdges}
        data-fade-top={edges.top}
        data-fade-bottom={edges.bottom}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar orientation="vertical" className="scroll-track">
        <ScrollAreaPrimitive.Thumb className="scroll-thumb" />
      </ScrollAreaPrimitive.Scrollbar>
    </ScrollAreaPrimitive.Root>
  )
}
