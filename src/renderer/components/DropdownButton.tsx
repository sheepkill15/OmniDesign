import type { ComponentProps, ReactNode } from 'react'
import { Button, MenuTrigger, Popover } from 'react-aria-components'
import { ChevronDownIcon } from '@heroicons/react/24/outline'

type Placement = ComponentProps<typeof Popover>['placement']

// The shared button-with-dropdown for the trusted UI, built on React Aria's MenuTrigger: uncontrolled
// and modal (the default). Modal is intentional — a modal popover dismisses on any outside click via
// its underlay and gives consistent keyboard/focus behavior; the trade-off is that the rest of the
// workspace is inert while a menu is open, which is acceptable. A caret is appended to the trigger and
// rotates while open (see the [aria-expanded] rule in styles.css). onOpenChange lets a caller freeze
// and detach the isolated preview while a menu sits over it, which removes the focus contention that
// would otherwise disrupt React Aria's focus-driven menu behavior.
export function DropdownButton({ trigger, children, label, triggerClassName, popoverClassName, placement = 'bottom start', crossOffset, onOpenChange }: {
  readonly trigger: ReactNode
  readonly children: ReactNode
  readonly label?: string
  readonly triggerClassName?: string
  readonly popoverClassName?: string
  readonly placement?: Placement
  readonly crossOffset?: number
  readonly onOpenChange?: (isOpen: boolean) => void
}) {
  return (
    <MenuTrigger onOpenChange={onOpenChange}>
      <Button className={triggerClassName} aria-label={label}>
        {trigger}
        <ChevronDownIcon className="dropdown-caret" aria-hidden="true" />
      </Button>
      <Popover className={popoverClassName} placement={placement} crossOffset={crossOffset}>
        {children}
      </Popover>
    </MenuTrigger>
  )
}
