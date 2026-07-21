import type { ComponentProps, ReactNode } from 'react'
import { Button, MenuTrigger, Popover } from 'react-aria-components'

type Placement = ComponentProps<typeof Popover>['placement']

// A trigger button with an attached popover, the shared primitive behind OmniDesign's dropdown
// controls (provider/model settings, project selection, layout switching). Callers supply the button
// content and the popover content; React Aria owns focus, keyboard, and outside-dismiss behavior so
// every dropdown dismisses and navigates identically. Pass isOpen/onOpenChange to control it.
export function MenuButton({ trigger, children, label, triggerClassName, popoverClassName, placement = 'bottom start', isOpen, onOpenChange }: {
  readonly trigger: ReactNode
  readonly children: ReactNode
  readonly label?: string
  readonly triggerClassName?: string
  readonly popoverClassName?: string
  readonly placement?: Placement
  readonly isOpen?: boolean
  readonly onOpenChange?: (isOpen: boolean) => void
}) {
  return (
    <MenuTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      <Button className={triggerClassName} aria-label={label}>{trigger}</Button>
      <Popover className={popoverClassName} placement={placement}>{children}</Popover>
    </MenuTrigger>
  )
}
