import { useEffect, useRef, useState } from 'react'
import type { ComponentType, SVGProps } from 'react'
import { Button, Menu, MenuItem, Tooltip, TooltipTrigger } from 'react-aria-components'
import { ArrowPathIcon, PaperClipIcon } from '@heroicons/react/24/outline'
import { DropdownButton } from './DropdownButton'

export type Icon = ComponentType<SVGProps<SVGSVGElement>>
export type AttachmentPickerKind = 'files' | 'folder'

export const terminalGenerationStages = ['queued', 'complete', 'failed', 'cancelled', 'interrupted']

export function IconButton({ label, icon: IconComponent, onPress }: { readonly label: string; readonly icon: Icon; readonly onPress?: () => void }) {
  return (
    <TooltipTrigger delay={350}>
      <Button className="icon-button" aria-label={label} onPress={onPress}>
        <IconComponent aria-hidden="true" />
      </Button>
      <Tooltip className="tooltip">{label}</Tooltip>
    </TooltipTrigger>
  )
}

export function GenerationActivitySection({ className = 'conversation-activity', id, steps, title = 'Generation details' }: { readonly className?: string; readonly id: string; readonly steps: readonly GenerationStep[]; readonly title?: string }) {
  const [expanded, setExpanded] = useState(true)
  return (
    <details className={className} key={id} open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary><span>{title}</span><small>{steps.length} update{steps.length === 1 ? '' : 's'}</small></summary>
      <div className="conversation-activity-steps">{steps.map((step) => <div className={`conversation-step step-${step.stage}`} key={step.id}><span className="conversation-step-label">{step.label}</span>{step.detail && <span className="conversation-step-detail">{step.detail}</span>}</div>)}</div>
    </details>
  )
}

// One inline editor for every renamable title (project name, design title). It reads as plain heading
// text, and on focus becomes a calm bordered field with an animated ring — same font, size, and position
// in both states, so entering edit doesn't shift the layout. It auto-saves on blur (clicking outside) or
// Enter, reverts on Escape, and never shows Save/Cancel controls.
export function EditableTitle({ value, label, variant, pending = false, onSave }: {
  readonly value: string
  readonly label: string
  readonly variant: 'page' | 'workspace' | 'card'
  readonly pending?: boolean
  readonly onSave: (value: string) => Promise<void>
}) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelling = useRef(false)
  // Follow external changes (e.g. a generated title landing) except while the user is actively editing.
  useEffect(() => { if (!focused) setDraft(value) }, [focused, value])
  const commit = async () => {
    setFocused(false)
    if (cancelling.current) { cancelling.current = false; setDraft(value); setError(null); return }
    const next = draft.trim()
    if (!next || next === value) { setDraft(value); setError(null); return }
    setError(null)
    try {
      await onSave(next)
    } catch (reason) {
      setDraft(value)
      setError(reason instanceof Error ? reason.message : `${label} could not be renamed.`)
    }
  }
  return (
    <div className={`editable-title editable-title-${variant}`}>
      <div className="editable-title-field">
        <input
          ref={inputRef}
          className="inline-edit"
          aria-label={`Rename ${label}`}
          value={draft}
          maxLength={200}
          readOnly={pending}
          spellCheck={false}
          onFocus={() => { if (!pending) setFocused(true) }}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); inputRef.current?.blur() }
            else if (event.key === 'Escape') { event.preventDefault(); cancelling.current = true; inputRef.current?.blur() }
          }}
        />
        {pending && <span className="title-pending" role="status" aria-label="Generating title…"><ArrowPathIcon className="spin" aria-hidden="true" /></span>}
      </div>
      {error && <small role="alert">{error}</small>}
    </div>
  )
}

export function AttachmentPicker({ onChoose, placement = 'top' }: { readonly onChoose: (kind: AttachmentPickerKind) => void; readonly placement?: 'top' | 'bottom' }) {
  return (
    <DropdownButton label="Attach files or folders" triggerClassName="icon-button attachment-picker" popoverClassName="project-popover attachment-picker-popover" placement={placement} trigger={<PaperClipIcon aria-hidden="true" />}>
      <Menu aria-label="Choose attachment type" onAction={(key) => onChoose(String(key) as AttachmentPickerKind)}>
        <MenuItem id="files">Choose files…</MenuItem>
        <MenuItem id="folder">Choose folder…</MenuItem>
      </Menu>
    </DropdownButton>
  )
}

export function ProjectThumbnail({ title, thumbnailDataUrl }: { readonly title: string; readonly thumbnailDataUrl: string | null }) {
  if (thumbnailDataUrl) return <img alt={`Preview of ${title}`} className="mini-preview-image" src={thumbnailDataUrl} />
  return <span className="mini-preview preview-sand" aria-hidden="true"><span className="preview-rail" /><span className="preview-line preview-line-long" /><span className="preview-line" /><span className="preview-block" /></span>
}

export function designSubtitle(design: OmniDesignDocument): string {
  const detail = design.revisions.at(-1)?.prompt ?? design.messages.find((message) => message.role === 'user')?.text ?? 'Ready for a first direction'
  return design.sourceProjectPath ? `${design.projectName} · ${detail}` : detail
}
