import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDownIcon } from '@heroicons/react/24/outline'

type Placement = 'bottom start' | 'bottom end' | 'top start' | 'top end'

// A trigger button with a plain DOM popover panel and a caret that rotates while open. Unlike a React
// Aria menu, it is non-modal by nature (the rest of the workspace stays interactive), its rows use
// ordinary CSS :hover rather than focus-driven highlighting, and it dismisses on an outside pointer or
// Escape. This behaves correctly above the isolated preview's native layer, where React Aria's modal
// overlays contend for focus. onOpenChange lets the workspace freeze the preview while the panel is up.
export function DropdownButton({ trigger, children, label, panelLabel, triggerClassName, panelClassName, placement = 'bottom start', onOpenChange }: {
  readonly trigger: ReactNode
  readonly children: ReactNode | ((close: () => void) => ReactNode)
  readonly label?: string
  readonly panelLabel?: string
  readonly triggerClassName?: string
  readonly panelClassName?: string
  readonly placement?: Placement
  readonly onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const change = (next: boolean) => { setOpen(next); onOpenChange?.(next) }

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (container.current && !container.current.contains(event.target as Node)) change(false)
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') change(false) }
    // Capture phase so the panel still closes when the press opens another overlay whose own handlers
    // stop the event before it reaches a bubble-phase listener.
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="dropdown" data-placement={placement} ref={container}>
      <button type="button" className={triggerClassName} aria-label={label} aria-haspopup="true" aria-expanded={open} onClick={() => change(!open)}>
        {trigger}
        <ChevronDownIcon className="dropdown-caret" data-open={open || undefined} aria-hidden="true" />
      </button>
      {open && (
        <div className={panelClassName ? `dropdown-panel ${panelClassName}` : 'dropdown-panel'} aria-label={panelLabel}>
          {typeof children === 'function' ? children(() => change(false)) : children}
        </div>
      )}
    </div>
  )
}
