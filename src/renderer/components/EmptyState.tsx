import type { ComponentType, SVGProps } from 'react'
import type { ReactNode } from 'react'

// Shared empty-state primitive per DESIGN_SYSTEM.md: an icon, a concise title, optional body copy,
// and the most useful next action when one exists. Renders as a quiet region, not a marketing panel.
export function EmptyState({ icon: Icon, title, body, action, className = 'empty-state' }: {
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>
  readonly title: string
  readonly body?: string
  readonly action?: ReactNode
  readonly className?: string
}) {
  return (
    <div className={className}>
      <Icon aria-hidden="true" />
      <strong>{title}</strong>
      {body && <p>{body}</p>}
      {action}
    </div>
  )
}
