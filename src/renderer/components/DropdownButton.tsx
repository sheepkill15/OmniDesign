import type { ComponentProps, ReactNode } from 'react'
import { useContext, useRef } from 'react'
import { Button, MenuTrigger, Popover, Tooltip, TooltipTrigger } from 'react-aria-components'
import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { PreviewOverlayContext } from './PreviewOverlayContext'

type Placement = ComponentProps<typeof Popover>['placement']
type ComposerFocusSnapshot = {
  readonly element: HTMLInputElement | HTMLTextAreaElement
  readonly selectionStart: number | null
  readonly selectionEnd: number | null
  readonly selectionDirection: 'forward' | 'backward' | 'none' | null
}

// The shared button-with-dropdown for the trusted UI, built on React Aria's MenuTrigger: uncontrolled
// and modal (the default). Modal is intentional — a modal popover dismisses on any outside click via
// its underlay and gives consistent keyboard/focus behavior; the trade-off is that the rest of the
// workspace is inert while a menu is open, which is acceptable. A caret is appended to the trigger and
// rotates while open (see the [aria-expanded] rule in styles.css). onOpenChange lets a caller freeze
// and detach the isolated preview while a menu sits over it, which removes the focus contention that
// would otherwise disrupt React Aria's focus-driven menu behavior.
export function DropdownButton({ trigger, children, label, tooltip, triggerClassName, popoverClassName, placement = 'bottom', isDisabled = false, onOpenChange }: {
  readonly trigger: ReactNode
  readonly children: ReactNode
  readonly label?: string
  // Icon-only triggers must pair their accessible name with a visible tooltip.
  readonly tooltip?: string
  readonly triggerClassName?: string
  readonly popoverClassName?: string
  readonly placement?: Placement
  readonly isDisabled?: boolean
  readonly onOpenChange?: (isOpen: boolean) => void
}) {
  const previewOverlay = useContext(PreviewOverlayContext)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const open = useRef(false)
  const priorComposerFocus = useRef<ComposerFocusSnapshot | null>(null)

  const rememberComposerFocus = (candidate: EventTarget | null) => {
    const composer = triggerRef.current?.closest('.new-design-composer, .workspace-composer')
    priorComposerFocus.current = (candidate instanceof HTMLInputElement || candidate instanceof HTMLTextAreaElement) && composer?.contains(candidate)
      ? { element: candidate, selectionStart: candidate.selectionStart, selectionEnd: candidate.selectionEnd, selectionDirection: candidate.selectionDirection }
      : null
  }

  const restoreComposerFocus = () => {
    const prior = priorComposerFocus.current
    priorComposerFocus.current = null
    if (!prior) return
    const restoreAfterTrigger = (framesRemaining: number) => requestAnimationFrame(() => {
      if (!prior.element.isConnected || prior.element.disabled) return
      if (document.activeElement !== triggerRef.current) {
        if (framesRemaining > 0) restoreAfterTrigger(framesRemaining - 1)
        return
      }
      prior.element.focus({ preventScroll: true })
      if (prior.selectionStart !== null && prior.selectionEnd !== null) prior.element.setSelectionRange(prior.selectionStart, prior.selectionEnd, prior.selectionDirection ?? undefined)
    })
    restoreAfterTrigger(8)
  }

  const triggerButton = (
    <Button ref={triggerRef} className={triggerClassName} aria-label={label} isDisabled={isDisabled} onPointerDownCapture={() => { if (!open.current) rememberComposerFocus(document.activeElement) }} onKeyDown={() => { if (!open.current) priorComposerFocus.current = null }}>
      {trigger}
      <ChevronDownIcon className="dropdown-caret" aria-hidden="true" />
    </Button>
  )
  return (
    <MenuTrigger onOpenChange={(isOpen) => {
      open.current = isOpen
      if (isOpen) previewOverlay?.open()
      else {
        previewOverlay?.close()
        restoreComposerFocus()
      }
      onOpenChange?.(isOpen)
    }}>
      {tooltip !== undefined
        ? <TooltipTrigger delay={350}>{triggerButton}<Tooltip className="tooltip">{tooltip}</Tooltip></TooltipTrigger>
        : triggerButton}
      <Popover className={popoverClassName} placement={placement} containerPadding={12}>
        {children}
      </Popover>
    </MenuTrigger>
  )
}
