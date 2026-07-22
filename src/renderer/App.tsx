import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  BellIcon,
  BoltIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
  FolderIcon,
  HomeIcon,
  PaperClipIcon,
  PencilSquareIcon,
  PlusIcon,
  SparklesIcon,
  StopIcon,
  TrashIcon,
  ViewColumnsIcon,
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftRightIcon,
  WindowIcon,
} from '@heroicons/react/24/outline'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType, KeyboardEvent, SVGProps } from 'react'
import { Button, Header, Input, Menu, MenuItem, MenuSection, Radio, RadioGroup, Slider, SliderThumb, SliderTrack, Switch, TextArea, TextField, Tooltip, TooltipTrigger } from 'react-aria-components'
import { AppModal } from './components/AppModal'
import { DropdownButton } from './components/DropdownButton'
import { GenerationElapsed } from './components/GenerationElapsed'
import { PreviewOverlayContext } from './components/PreviewOverlayContext'

type Icon = ComponentType<SVGProps<SVGSVGElement>>
type AttachmentPickerKind = 'files' | 'folder'

function IconButton({ label, icon: IconComponent, onPress }: { readonly label: string; readonly icon: Icon; readonly onPress?: () => void }) {
  return (
    <TooltipTrigger delay={350}>
      <Button className="icon-button" aria-label={label} onPress={onPress}>
        <IconComponent aria-hidden="true" />
      </Button>
      <Tooltip className="tooltip">{label}</Tooltip>
    </TooltipTrigger>
  )
}

function NavigationItem({ icon: IconComponent, label, badge, active = false, onPress }: { readonly icon: Icon; readonly label: string; readonly badge?: string; readonly active?: boolean; readonly onPress?: () => void }) {
  return (
    <Button className="navigation-item" data-active={active || undefined} onPress={onPress}>
      <IconComponent aria-hidden="true" />
      <span>{label}</span>
      {badge && <span className="navigation-badge">{badge}</span>}
    </Button>
  )
}

function ProjectNavItem({ project, activeProjectId, activeDesignId, onOpen, onOpenDesign, onAddDesign }: {
  readonly project: ProjectSummary
  readonly activeProjectId: string | null
  readonly activeDesignId: string | null
  readonly onOpen: (project: ProjectSummary) => void
  readonly onOpenDesign: (project: ProjectSummary, design: OmniDesignDocument) => void
  readonly onAddDesign: (project: ProjectSummary) => void
}) {
  const isStandalone = project.kind === 'standalone'
  const [expanded, setExpanded] = useState(false)
  const [designs, setDesigns] = useState<readonly OmniDesignDocument[]>([])
  const loadDesigns = useCallback(async () => {
    const detail = await window.omnidesign?.workspace.getProject(project.id)
    if (detail) setDesigns(detail.designs)
  }, [project.id])
  useEffect(() => { if (!isStandalone && expanded) void loadDesigns() }, [isStandalone, expanded, loadDesigns, project.updatedAt, project.designCount])
  const ProjectIcon = project.kind === 'linked' ? FolderIcon : DocumentDuplicateIcon

  return (
    <div className="project-nav-item">
      <div className="project-nav-row" data-standalone={isStandalone || undefined} data-active={project.id === activeProjectId || undefined}>
        {!isStandalone && <Button className="project-disclosure" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${project.name}`} aria-expanded={expanded} onPress={() => setExpanded((current) => !current)}>
          <ChevronRightIcon aria-hidden="true" data-expanded={expanded || undefined} />
        </Button>}
        <Button className="project-open" onPress={() => onOpen(project)}>
          <ProjectIcon aria-hidden="true" />
          <span>{project.name}</span>
        </Button>
        <span className="project-trailing">
          {!isStandalone && <><span className="project-count" aria-hidden="true">{project.designCount}</span>
            <TooltipTrigger delay={350}>
              <Button className="project-add" aria-label={`New design in ${project.name}`} onPress={() => onAddDesign(project)}><PlusIcon aria-hidden="true" /></Button>
              <Tooltip className="tooltip">New design in {project.name}</Tooltip>
            </TooltipTrigger></>}
        </span>
      </div>
      {!isStandalone && expanded && (
        <div className="design-sublist" role="group" aria-label={`${project.name} designs`}>
          {designs.map((design) => (
            <Button className="design-subrow" data-active={design.id === activeDesignId || undefined} key={design.id} onPress={() => onOpenDesign(project, design)}>
              <span>{design.title}</span>
            </Button>
          ))}
          {!designs.length && <p className="design-sublist-empty">No designs yet.</p>}
        </div>
      )}
    </div>
  )
}

function Sidebar({ projects, activeProjectId, activeDesignId, activeGenerationCount, diagnosticCount, homeActive, settingsOpen, providersOpen, generationsOpen, diagnosticsOpen, trashOpen, onHome, onOpen, onOpenDesign, onAddDesign, onSettings, onProviders, onGenerations, onDiagnostics, onTrash }: {
  readonly projects: readonly ProjectSummary[]
  readonly activeProjectId: string | null
  readonly activeDesignId: string | null
  readonly activeGenerationCount: number
  readonly diagnosticCount: number
  readonly homeActive: boolean
  readonly settingsOpen: boolean
  readonly providersOpen: boolean
  readonly generationsOpen: boolean
  readonly diagnosticsOpen: boolean
  readonly trashOpen: boolean
  readonly onHome: () => void
  readonly onOpen: (project: ProjectSummary) => void
  readonly onOpenDesign: (project: ProjectSummary, design: OmniDesignDocument) => void
  readonly onAddDesign: (project: ProjectSummary) => void
  readonly onSettings: () => void
  readonly onProviders: () => void
  readonly onGenerations: () => void
  readonly onDiagnostics: () => void
  readonly onTrash: () => void
}) {
  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="brand-row">
        <span className="brand-mark" aria-hidden="true"><SparklesIcon /></span>
        <span className="brand-name">OmniDesign</span>
        <IconButton label="Generation activity" icon={BellIcon} onPress={onGenerations} />
      </div>
      <nav className="global-navigation" aria-label="Application">
        <NavigationItem icon={HomeIcon} label="Home" active={homeActive} onPress={onHome} />
        <NavigationItem icon={BoltIcon} label="Generations" badge={activeGenerationCount ? String(activeGenerationCount) : undefined} active={generationsOpen} onPress={onGenerations} />
      </nav>
      <div className="sidebar-section">
        <div className="sidebar-heading"><span>Projects</span><IconButton label="New design" icon={PlusIcon} onPress={onHome} /></div>
        <div className="project-navigation" aria-label="Projects">
          {projects.map((project) => (
            <ProjectNavItem key={project.id} project={project} activeProjectId={activeProjectId} activeDesignId={activeDesignId} onOpen={onOpen} onOpenDesign={onOpenDesign} onAddDesign={onAddDesign} />
          ))}
          {!projects.length && <p className="sidebar-empty">Your local projects will appear here.</p>}
        </div>
      </div>
      <div className="sidebar-footer">
        <NavigationItem icon={CommandLineIcon} label="Providers" active={providersOpen} onPress={onProviders} />
        <NavigationItem icon={ExclamationTriangleIcon} label="Diagnostics" badge={diagnosticCount ? String(diagnosticCount) : undefined} active={diagnosticsOpen} onPress={onDiagnostics} />
        <NavigationItem icon={TrashIcon} label="Trash" active={trashOpen} onPress={onTrash} />
        <NavigationItem icon={Cog6ToothIcon} label="Settings" active={settingsOpen} onPress={onSettings} />
        <div className="account-row"><span className="avatar">OD</span><span><strong>Local workspace</strong><small>Stored on this device</small></span></div>
      </div>
    </aside>
  )
}

function Generations({ designs, onOpen, onCancel, onRemove, onResume }: {
  readonly designs: readonly OmniDesignDocument[]
  readonly onOpen: (design: OmniDesignDocument) => void
  readonly onCancel: (jobId: string) => Promise<void>
  readonly onRemove: (jobId: string) => Promise<void>
  readonly onResume: (designId: string) => Promise<void>
}) {
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const jobs = designs.flatMap((design) => design.generationJobs
    .filter((job) => ['queued', 'running'].includes(job.state))
    .map((job) => ({ design, job })))
  const runningCount = jobs.filter(({ job }) => job.state === 'running').length
  const queuedCount = jobs.length - runningCount
  const summary = [runningCount ? `${runningCount} running` : '', queuedCount ? `${queuedCount} queued` : ''].filter(Boolean).join(' · ')
  const runAction = async (id: string, action: () => Promise<void>, failure: string) => {
    setPendingAction(id)
    setError(null)
    try {
      await action()
    } catch (reason) {
      setError(`${failure}${reason instanceof Error && reason.message ? ` ${reason.message}` : ''}`)
    } finally {
      setPendingAction(null)
    }
  }
  return (
    <main className="settings-main">
      <div className="settings-content">
        <header className="page-heading"><h1>Generations</h1><p>Work continues while you move between designs. Each design runs one prompt at a time.</p></header>
        <section className="settings-section" aria-labelledby="active-generations-heading">
          <div className="section-heading"><h2 id="active-generations-heading">Active work</h2><span>{jobs.length ? summary : 'All caught up'}</span></div>
          {error && <div className="workspace-feedback" data-tone="error" role="alert"><span><strong>Generation action failed.</strong><small>{error}</small></span><Button className="text-button" onPress={() => setError(null)}>Dismiss</Button></div>}
          <div className="generation-list">
            {jobs.map(({ design, job }) => {
              const progress = job.startedAt
                ? design.generationSteps.filter((step) => step.createdAt >= job.startedAt! && !terminalGenerationStages.includes(step.stage)).slice(-8)
                : []
              const stage = design.queuePaused ? 'Queue paused' : job.state === 'queued' ? 'Queued' : progress.at(-1)?.label ?? 'Starting'
              return <article className="generation-row" key={job.id}>
                <Button aria-label={`${design.projectName}, ${design.title}: ${stage}`} className="generation-copy" onPress={() => onOpen(design)}><span className="generation-heading"><strong>{design.title}</strong><em>{design.projectName}</em></span><small>{stage} · {job.providerId === 'mock' ? 'Development provider' : `${job.providerId} · ${job.modelId}`} · {job.prompt}</small></Button>
                <GenerationElapsed startedAt={job.startedAt ?? job.createdAt} />
                {job.state === 'queued'
                  ? design.queuePaused && design.generationJobs.find((candidate) => candidate.state === 'queued')?.id === job.id
                    ? <span className="generation-actions"><Button className="secondary-action" isDisabled={pendingAction !== null} onPress={() => void runAction(`resume:${design.id}`, () => onResume(design.id), 'The paused queue could not be resumed.')}>{pendingAction === `resume:${design.id}` ? 'Resuming…' : 'Resume'}</Button><Button className="secondary-action" isDisabled={pendingAction !== null} onPress={() => void runAction(`remove:${job.id}`, () => onRemove(job.id), 'The queued prompt could not be removed.')}>{pendingAction === `remove:${job.id}` ? 'Removing…' : 'Remove'}</Button></span>
                    : <Button className="secondary-action" isDisabled={pendingAction !== null} onPress={() => void runAction(`remove:${job.id}`, () => onRemove(job.id), 'The queued prompt could not be removed.')}>{pendingAction === `remove:${job.id}` ? 'Removing…' : 'Remove'}</Button>
                  : <Button className="secondary-action" isDisabled={pendingAction !== null} onPress={() => void runAction(`stop:${job.id}`, () => onCancel(job.id), 'The running generation could not be stopped.')}><StopIcon aria-hidden="true" />{pendingAction === `stop:${job.id}` ? 'Stopping…' : 'Stop'}</Button>}
                {progress.length ? <GenerationActivitySection className="active-generation-activity" id={`${job.id}-progress`} steps={progress} title="Progress details" /> : null}
              </article>
            })}
            {!jobs.length && <p className="settings-empty">No generations are queued or running.</p>}
          </div>
        </section>
      </div>
    </main>
  )
}

type ConversationFeedItem =
  | { readonly kind: 'message'; readonly createdAt: string; readonly message: DesignMessage }
  | { readonly kind: 'step'; readonly createdAt: string; readonly step: GenerationStep }
  | { readonly kind: 'activity'; readonly createdAt: string; readonly id: string; readonly steps: GenerationStep[] }

const terminalGenerationStages = ['queued', 'complete', 'failed', 'cancelled', 'interrupted']

// Interleave persisted user/assistant messages with the recorded generation milestones so the major
// steps of each run appear in the conversation history in the order they happened.
function buildConversationFeed(design: OmniDesignDocument, detail: 'full' | 'concise'): ConversationFeedItem[] {
  const items: ConversationFeedItem[] = [
    ...design.messages.map((message) => ({ kind: 'message' as const, createdAt: message.createdAt, message })),
    ...design.generationSteps.filter((step) => detail === 'full' || terminalGenerationStages.includes(step.stage)).map((step) => ({ kind: 'step' as const, createdAt: step.createdAt, step })),
  ]
  const sorted = items.sort((first, second) => first.createdAt < second.createdAt ? -1 : first.createdAt > second.createdAt ? 1 : 0)
  if (detail === 'concise') return sorted
  return sorted.reduce<ConversationFeedItem[]>((feed, item) => {
    if (item.kind !== 'step' || terminalGenerationStages.includes(item.step.stage)) return [...feed, item]
    const previous = feed.at(-1)
    if (previous?.kind === 'activity') {
      previous.steps.push(item.step)
      return feed
    }
    return [...feed, { kind: 'activity', createdAt: item.createdAt, id: item.step.id, steps: [item.step] }]
  }, [])
}

function GenerationActivitySection({ className = 'conversation-activity', id, steps, title = 'Generation details' }: { readonly className?: string; readonly id: string; readonly steps: readonly GenerationStep[]; readonly title?: string }) {
  const [expanded, setExpanded] = useState(true)
  return (
    <details className={className} key={id} open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary><span>{title}</span><small>{steps.length} update{steps.length === 1 ? '' : 's'}</small></summary>
      <div className="conversation-activity-steps">{steps.map((step) => <div className={`conversation-step step-${step.stage}`} key={step.id}><span className="conversation-step-label">{step.label}</span>{step.detail && <span className="conversation-step-detail">{step.detail}</span>}</div>)}</div>
    </details>
  )
}

function Providers({ providers, loading, error, onRefresh }: {
  readonly providers: readonly ProviderStatus[]
  readonly loading: boolean
  readonly error: string | null
  readonly onRefresh: () => void
}) {
  return (
    <main className="settings-main">
      <div className="settings-content">
        <header className="page-heading"><h1>Providers</h1><p>OmniDesign uses the existing sign-in state of locally installed provider tools. No credentials are stored here.</p></header>
        <section className="settings-section" aria-labelledby="provider-availability-heading">
          <div className="section-heading"><h2 id="provider-availability-heading">Availability</h2><Button className="secondary-action" onPress={onRefresh} isDisabled={loading}><ArrowPathIcon className={loading ? 'spin' : undefined} aria-hidden="true" />Refresh</Button></div>
          {error && <div className="workspace-feedback" data-tone="error" role="alert"><span><strong>Provider availability could not be refreshed.</strong><small>{error}</small></span></div>}
          <div className="provider-list">
            {providers.map((provider) => <article className="provider-row" key={provider.id}>
              <span className="provider-status" data-ready={provider.installed && provider.authenticated || undefined} aria-hidden="true" />
              <span><strong>{provider.name}</strong><small>{provider.detail}</small>{provider.models.length > 0 && <em>{provider.models.length} model{provider.models.length === 1 ? '' : 's'} available</em>}</span>
              <span className="provider-state">{provider.installed && provider.authenticated ? 'Ready' : provider.installed ? 'Sign in required' : 'Unavailable'}</span>
            </article>)}
            {!loading && !providers.length && <p className="settings-empty">No provider availability information is available. Refresh to test local provider tools.</p>}
          </div>
        </section>
      </div>
    </main>
  )
}

function Settings({ theme, notificationsEnabled, generationDetail, onThemeChange, onNotificationsChange, onGenerationDetailChange }: { readonly theme: 'dark' | 'light'; readonly notificationsEnabled: boolean; readonly generationDetail: 'full' | 'concise'; readonly onThemeChange: (theme: 'dark' | 'light') => void; readonly onNotificationsChange: (enabled: boolean) => void; readonly onGenerationDetailChange: (detail: 'full' | 'concise') => void }) {
  return (
    <main className="settings-main">
      <div className="settings-content">
        <header className="page-heading"><h1>Settings</h1><p>Choose how OmniDesign’s trusted workspace appears on this device.</p></header>
        <section className="settings-section" aria-labelledby="appearance-heading">
          <div className="section-heading"><h2 id="appearance-heading">Appearance</h2><span>Saved locally</span></div>
          <RadioGroup aria-label="Application theme" className="theme-options" value={theme} onChange={(value) => onThemeChange(value as 'dark' | 'light')}>
            <Radio className="theme-option" value="dark"><span className="theme-swatch theme-swatch-dark" aria-hidden="true" /><span><strong>Dark</strong><small>Default for focused design work</small></span></Radio>
            <Radio className="theme-option" value="light"><span className="theme-swatch theme-swatch-light" aria-hidden="true" /><span><strong>Light</strong><small>A bright, low-glare workspace</small></span></Radio>
          </RadioGroup>
        </section>
        <section className="settings-section" aria-labelledby="notifications-heading">
          <div className="section-heading"><h2 id="notifications-heading">Notifications</h2><span>Saved locally</span></div>
          <div className="settings-row"><span><strong>System notifications</strong><small>Notify when generation completes or needs attention.</small></span><Switch aria-label="System notifications" className="settings-switch" isSelected={notificationsEnabled} onChange={onNotificationsChange}><span className="settings-switch-state">{notificationsEnabled ? 'On' : 'Off'}</span><span className="settings-switch-track" aria-hidden="true"><span className="settings-switch-thumb" /></span></Switch></div>
        </section>
        <section className="settings-section" aria-labelledby="generation-detail-heading">
          <div className="section-heading"><h2 id="generation-detail-heading">Generation details</h2><span>Saved locally</span></div>
          <RadioGroup aria-label="Generation detail level" className="theme-options" value={generationDetail} onChange={(value) => onGenerationDetailChange(value as 'full' | 'concise')}>
            <Radio className="theme-option" value="full"><span><strong>Full</strong><small>Provider activity, tool work, stages, and validation details</small></span></Radio>
            <Radio className="theme-option" value="concise"><span><strong>Concise</strong><small>Queue and final outcomes only</small></span></Radio>
          </RadioGroup>
        </section>
      </div>
    </main>
  )
}

function describeStoppedGeneration(job: GenerationJob): { readonly title: string; readonly message: string; readonly openProviders: boolean } {
  const error = job.error ?? ''
  if (job.state === 'interrupted') return { title: 'Generation interrupted', message: 'OmniDesign closed before this work finished. Continue from retained files or retry from the last revision.', openProviders: false }
  if (job.state === 'cancelled') return { title: 'Generation cancelled', message: 'The previous revision is still active. Continue from retained files or start a fresh retry.', openProviders: false }
  if (/ENOTFOUND|ECONN|network|offline|fetch failed|socket|timed? out/i.test(error)) return { title: 'Provider connection unavailable', message: 'Check your connection and provider service, then retry.', openProviders: false }
  if (/auth|sign.?in|log.?in|unauthorized|credential/i.test(error)) return { title: 'Provider sign-in required', message: 'Sign in again or choose another available provider before continuing.', openProviders: true }
  if (/model.*(?:unavailable|not found|unsupported)|selected model/i.test(error)) return { title: 'Selected model unavailable', message: 'Choose an available provider and model before sending another prompt.', openProviders: true }
  return { title: 'Generation failed', message: 'Review the technical details, then continue partial work or retry from the last revision.', openProviders: false }
}

function EditableTitle({ value, label, variant, onSave }: {
  readonly value: string
  readonly label: string
  readonly variant: 'page' | 'workspace' | 'card'
  readonly onSave: (value: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (!editing) setDraft(value) }, [editing, value])
  const save = async () => {
    const next = draft.trim()
    if (!next || next === value || saving) { if (next === value) setEditing(false); return }
    setSaving(true)
    setError(null)
    if (variant === 'card') setEditing(false)
    try {
      await onSave(next)
      setEditing(false)
    } catch (reason) {
      if (variant === 'card') setEditing(true)
      setError(reason instanceof Error ? reason.message : `${label} could not be renamed.`)
    } finally {
      setSaving(false)
    }
  }
  if (editing) {
    return <div className={`editable-title editable-title-${variant}`}><form onSubmit={(event) => { event.preventDefault(); void save() }}><Input aria-label={`Rename ${label}`} autoFocus maxLength={200} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setEditing(false); setError(null) } }} /><Button className="secondary-action" isDisabled={!draft.trim() || saving} type="submit">{saving ? 'Saving…' : 'Save'}</Button><Button className="text-button" isDisabled={saving} onPress={() => { setEditing(false); setError(null) }}>Cancel</Button></form>{error && <small role="alert">{error}</small>}</div>
  }
  const TitleElement: 'h1' | 'h3' = variant === 'card' ? 'h3' : 'h1'
  return <div className={`editable-title editable-title-${variant}`}><span><TitleElement>{value}</TitleElement><IconButton label={`Rename ${label}`} icon={PencilSquareIcon} onPress={() => setEditing(true)} /></span>{error && <small role="alert">{error}</small>}</div>
}

interface DiagnosticListItem {
  readonly id: string
  readonly design: OmniDesignDocument
  readonly revisionId: string | null
  readonly level: 'warning' | 'error'
  readonly title: string
  readonly detail: string
  readonly context: string
  readonly createdAt: string
}

function collectDiagnostics(designs: readonly OmniDesignDocument[]): DiagnosticListItem[] {
  const items = designs.flatMap((design) => [
    ...design.revisions.flatMap((revision) => revision.diagnostics.map((diagnostic): DiagnosticListItem => ({
      id: diagnostic.id,
      design,
      revisionId: revision.id,
      level: diagnostic.level,
      title: diagnostic.kind === 'runtime' ? 'Preview runtime issue' : diagnostic.kind === 'load' ? 'Preview load issue' : diagnostic.kind === 'quality' ? 'Design quality warning' : 'Preview console issue',
      detail: diagnostic.message,
      context: `${design.projectName} · ${design.title}${diagnostic.source ? ` · ${diagnostic.source}${diagnostic.line ? `:${diagnostic.line}` : ''}` : ''}`,
      createdAt: diagnostic.createdAt,
    }))),
    ...design.invalidCandidates.map((candidate): DiagnosticListItem => ({
      id: candidate.id,
      design,
      revisionId: null,
      level: 'error',
      title: 'Candidate rejected',
      detail: candidate.diagnostic,
      context: `${design.projectName} · ${design.title}`,
      createdAt: candidate.createdAt,
    })),
    ...design.generationJobs.filter((job) => job.state === 'failed' && job.error).map((job): DiagnosticListItem => ({
      id: job.id,
      design,
      revisionId: null,
      level: 'error',
      title: 'Generation failed',
      detail: job.error ?? 'Generation failed.',
      context: `${design.projectName} · ${design.title} · ${job.providerId} · ${job.modelId}`,
      createdAt: job.completedAt ?? job.createdAt,
    })),
  ])
  return items.sort((first, second) => second.createdAt.localeCompare(first.createdAt))
}

function Diagnostics({ designs, onOpen }: {
  readonly designs: readonly OmniDesignDocument[]
  readonly onOpen: (design: OmniDesignDocument, revisionId: string | null) => void
}) {
  const diagnostics = collectDiagnostics(designs)
  return (
    <main className="settings-main">
      <div className="settings-content">
        <header className="page-heading"><h1>Diagnostics</h1><p>Review retained generation and preview issues. Opening a preview issue selects the revision where it occurred.</p></header>
        <section className="settings-section" aria-labelledby="diagnostics-heading">
          <div className="section-heading"><h2 id="diagnostics-heading">Recorded issues</h2><span>{diagnostics.length ? `${diagnostics.length} retained` : 'All clear'}</span></div>
          <div className="diagnostics-list">
            {diagnostics.map((diagnostic) => (
              <Button className="diagnostic-row" data-level={diagnostic.level} key={`${diagnostic.design.id}-${diagnostic.id}`} onPress={() => onOpen(diagnostic.design, diagnostic.revisionId)}>
                <span className="diagnostic-indicator" aria-hidden="true"><ExclamationTriangleIcon /></span>
                <span className="diagnostic-copy"><strong>{diagnostic.title}</strong><small>{diagnostic.detail}</small><em>{diagnostic.context}</em></span>
                <time dateTime={diagnostic.createdAt}>{new Date(diagnostic.createdAt).toLocaleString()}</time>
              </Button>
            ))}
            {!diagnostics.length && <div className="diagnostics-empty"><CheckCircleIcon aria-hidden="true" /><strong>No diagnostics recorded</strong><p>Preview warnings, rejected candidates, and failed generation details will appear here.</p></div>}
          </div>
        </section>
      </div>
    </main>
  )
}

function AttachmentPicker({ onChoose, placement = 'top' }: { readonly onChoose: (kind: AttachmentPickerKind) => void; readonly placement?: 'top' | 'bottom' }) {
  return (
    <DropdownButton label="Attach files or folders" triggerClassName="icon-button attachment-picker" popoverClassName="project-popover attachment-picker-popover" placement={placement} trigger={<PaperClipIcon aria-hidden="true" />}>
      <Menu aria-label="Choose attachment type" onAction={(key) => onChoose(String(key) as AttachmentPickerKind)}>
        <MenuItem id="files">Choose files…</MenuItem>
        <MenuItem id="folder">Choose folder…</MenuItem>
      </Menu>
    </DropdownButton>
  )
}

function Trash({ items, onRestore, onPurge, onEmpty }: { readonly items: readonly TrashItem[]; readonly onRestore: (item: TrashItem) => Promise<void>; readonly onPurge: (item: TrashItem) => Promise<void>; readonly onEmpty: (items: readonly TrashItem[]) => Promise<void> }) {
  const [pendingPurge, setPendingPurge] = useState<TrashItem | 'all' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (action: () => Promise<void>, close?: () => void) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      close?.()
      setPendingPurge(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The trash action could not be completed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="settings-main">
      <div className="settings-content">
        <header className="page-heading"><h1>Trash</h1><p>Deleted projects and designs are recoverable for 30 days. Linked source folders are never deleted.</p></header>
        <section className="settings-section" aria-labelledby="trash-heading">
          <div className="section-heading"><h2 id="trash-heading">Recently deleted</h2><span className="section-heading-actions"><span>{items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : 'Empty'}</span>{items.length > 0 && <Button className="secondary-action danger-action" onPress={() => setPendingPurge('all')}>Empty trash</Button>}</span></div>
          <div className="generation-list">
            {items.map((item) => <article className="generation-row" key={`${item.kind}-${item.id}`}>
              <span className="generation-copy"><strong>{item.name}</strong><small>{item.kind === 'project' ? 'Project' : `Design in ${item.projectName ?? 'project'}`} · Purges {new Date(item.purgeAt).toLocaleDateString()}</small></span>
              <Button className="secondary-action" isDisabled={busy} onPress={() => void run(() => onRestore(item))}>Restore</Button>
              <Button className="secondary-action danger-action" isDisabled={busy} onPress={() => setPendingPurge(item)}>Delete permanently</Button>
            </article>)}
            {!items.length && <p className="settings-empty">No deleted projects or designs.</p>}
          </div>
          {error && <p className="trash-error" role="alert">{error}</p>}
        </section>
      </div>
      <AppModal isOpen={pendingPurge !== null} onOpenChange={(open) => { if (!open && !busy) setPendingPurge(null) }} title={pendingPurge === 'all' ? 'Empty trash?' : `Permanently delete ${pendingPurge?.name ?? 'item'}?`}>
        {(close) => <>
          <p>{pendingPurge === 'all' ? `This permanently deletes all ${items.length} trashed item${items.length === 1 ? '' : 's'} and their OmniDesign history.` : 'This permanently deletes the design and its OmniDesign history.'} This cannot be undone. Linked source folders remain untouched.</p>
          <div className="clone-modal-actions"><Button className="secondary-action" isDisabled={busy} onPress={close}>Cancel</Button><Button className="clone-confirm-action danger-confirm-action" isDisabled={busy} onPress={() => void run(() => pendingPurge === 'all' ? onEmpty(items) : pendingPurge ? onPurge(pendingPurge) : Promise.resolve(), close)}>{busy ? 'Deleting…' : pendingPurge === 'all' ? 'Empty trash' : 'Delete permanently'}</Button></div>
        </>}
      </AppModal>
    </main>
  )
}

type ProviderId = 'mock' | 'codex' | 'claude'

function GenerationSettingsMenu({ providers, providerId, modelId, effort, onChange }: {
  readonly providers: readonly ProviderStatus[]
  readonly providerId: ProviderId
  readonly modelId: string
  readonly effort: string | null
  readonly onChange: (selection: { providerId: ProviderId; modelId: string; effort: string | null }) => void
}) {
  const available = providers.filter((provider) => provider.installed && provider.authenticated && provider.models.length)
  const provider = available.find((candidate) => candidate.id === providerId)
  const model = provider?.models.find((candidate) => candidate.id === modelId) ?? provider?.models[0]
  const efforts = model?.effortLevels ?? []
  const defaultEffort = (levels: readonly ProviderEffortLevel[]) => levels.find((candidate) => candidate.isDefault)?.id ?? levels[0]?.id ?? null
  const effortForModel = (levels: readonly ProviderEffortLevel[]) => effort && levels.some((candidate) => candidate.id === effort) ? effort : defaultEffort(levels)
  const activeEffort = effort ?? defaultEffort(efforts)
  const effortIndex = Math.max(0, efforts.findIndex((candidate) => candidate.id === activeEffort))
  const selectProvider = (nextProviderId: ProviderId) => {
    const nextProvider = available.find((candidate) => candidate.id === nextProviderId)
    const nextModel = nextProvider?.models[0]
    onChange({ providerId: nextProviderId, modelId: nextModel?.id ?? 'mock-v1', effort: defaultEffort(nextModel?.effortLevels ?? []) })
  }

  return (
    <DropdownButton
      label="Generation settings"
      triggerClassName="generation-settings-button"
      popoverClassName="generation-settings-popover"
      placement="top"
      isDisabled={!available.length}
      trigger={<><CommandLineIcon aria-hidden="true" /><span>{provider ? `${provider.name} · ${model?.name ?? 'Choose model'}` : 'No provider available'}</span></>}
    >
        <div className="generation-settings-columns">
          <section className="generation-settings-column"><h2>Provider</h2><Menu aria-label="Provider" className="generation-settings-menu" shouldCloseOnSelect={false}>
            {available.map((candidate) => <MenuItem id={candidate.id} key={candidate.id} onAction={() => selectProvider(candidate.id)}><span>{candidate.name}</span>{providerId === candidate.id && <CheckCircleIcon aria-hidden="true" />}</MenuItem>)}
          </Menu></section>
          <section className="generation-settings-column"><h2>Model</h2><Menu aria-label="Model" className="generation-settings-menu" shouldCloseOnSelect={false}>
            {(provider?.models ?? []).map((candidate) => <MenuItem id={`model-${candidate.id}`} key={candidate.id} onAction={() => onChange({ providerId, modelId: candidate.id, effort: effortForModel(candidate.effortLevels) })}><span>{candidate.name}</span>{model?.id === candidate.id && <CheckCircleIcon aria-hidden="true" />}</MenuItem>)}
            {!provider && <MenuItem id="no-model" isDisabled>No models available</MenuItem>}
          </Menu></section>
          <section className="generation-settings-column effort-control" data-disabled={!efforts.length || undefined}>
            <h2>Effort</h2><span>{efforts[effortIndex]?.name ?? 'Not supported by this model'}</span>
            <div className="effort-vertical-control">
              <Slider aria-label="Reasoning effort" orientation="vertical" className="effort-slider" minValue={0} maxValue={Math.max(0, efforts.length - 1)} step={1} value={effortIndex} isDisabled={!efforts.length} onChange={(value) => onChange({ providerId, modelId: model?.id ?? 'mock-v1', effort: efforts[Number(value)]?.id ?? null })}>
                <SliderTrack className="effort-slider-track">
                  <span className="effort-rail" aria-hidden="true" />
                  <span className="effort-nodes" aria-hidden="true">{efforts.map((candidate, index) => <span className="effort-node" data-active={index === effortIndex || undefined} key={candidate.id} />)}</span>
                  <SliderThumb className="effort-slider-thumb" />
                </SliderTrack>
              </Slider>
              {efforts.length > 1 && <div className="effort-labels"><span>{efforts.at(-1)?.name}</span><span>{efforts[0]?.name}</span></div>}
            </div>
          </section>
        </div>
    </DropdownButton>
  )
}

function ProjectSelectionMenu({ projects, includeStandalone = true, onAction }: {
  readonly projects: readonly ProjectSummary[]
  readonly includeStandalone?: boolean
  readonly onAction: (key: string) => void
}) {
  const linkedProjects = projects.filter((project) => project.kind === 'linked')
  return (
    <Menu aria-label="Design project" onAction={(key) => onAction(String(key))}>
      {includeStandalone && <MenuItem id="standalone">Standalone design</MenuItem>}
      <MenuItem id="folder">Choose local project folder…</MenuItem>
      <MenuItem id="clone">Clone Git repository…</MenuItem>
      {linkedProjects.length > 0 && <MenuSection className="project-popover-section">
        <Header className="project-popover-header">Add to a project</Header>
        {linkedProjects.map((project) => <MenuItem id={`project:${project.id}`} key={project.id}>{project.name}</MenuItem>)}
      </MenuSection>}
    </Menu>
  )
}

function NewDesignComposer({ providers, busy, fixedProject, projects = [], initialProject = null, onCreate, onOpenProviders }: {
  readonly providers: readonly ProviderStatus[]
  readonly busy: boolean
  readonly fixedProject?: ProjectSummary
  readonly projects?: readonly ProjectSummary[]
  readonly initialProject?: ProjectSummary | null
  readonly onCreate: (prompt: string, providerId: ProviderId, modelId: string, effort: string | null, target: CreateDesignTarget | null, attachments: readonly DesignAttachment[]) => Promise<void>
  readonly onOpenProviders: () => void
}) {
  const [prompt, setPrompt] = useState('')
  const readyProviders = providers.filter((provider) => provider.installed && provider.authenticated && provider.models.length)
  const [selection, setSelection] = useState<GenerationSelection>({ providerId: 'mock', modelId: 'mock-v1', effort: null })
  const [sourceProjectPath, setSourceProjectPath] = useState<string | null>(null)
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(initialProject)
  const [cloneTarget, setCloneTarget] = useState<{ remoteUrl: string; destinationDirectory: string } | null>(null)
  const [cloneModalOpen, setCloneModalOpen] = useState(false)
  const [cloneRemoteUrl, setCloneRemoteUrl] = useState('')
  const [cloneDestinationDirectory, setCloneDestinationDirectory] = useState('')
  const [attachments, setAttachments] = useState<readonly DesignAttachment[]>([])
  const [error, setError] = useState<string | null>(null)
  const hasUsableSelection = readyProviders.some((provider) => provider.id === selection.providerId && provider.models.some((model) => model.id === selection.modelId))
  useEffect(() => {
    const pending = window.omnidesign?.settings.getGenerationDefaults?.()
    if (!pending) return
    void pending.then((saved) => { if (saved) setSelection(saved) })
  }, [])
  useEffect(() => {
    const selectedProvider = readyProviders.find((provider) => provider.id === selection.providerId)
    if (selectedProvider?.models.some((model) => model.id === selection.modelId)) return
    const provider = readyProviders[0]
    const model = provider?.models[0]
    if (!provider || !model) return
    const effort = model.effortLevels.find((candidate) => candidate.isDefault)?.id ?? model.effortLevels[0]?.id ?? null
    setSelection({ providerId: provider.id, modelId: model.id, effort })
  }, [readyProviders, selection.modelId, selection.providerId])
  // Pre-fill the target when a project's "+" launched this composer.
  useEffect(() => {
    if (!initialProject) return
    setSelectedProject(initialProject)
    setSourceProjectPath(null)
    setCloneTarget(null)
  }, [initialProject])
  const applySelection = (next: GenerationSelection) => {
    setSelection(next)
    void window.omnidesign?.settings.saveGenerationDefaults?.(next)
  }
  const target = (): CreateDesignTarget | null => {
    if (fixedProject) return { projectId: fixedProject.id }
    if (cloneTarget) return { cloneRemoteUrl: cloneTarget.remoteUrl, cloneDestinationDirectory: cloneTarget.destinationDirectory }
    if (selectedProject) return { projectId: selectedProject.id }
    return sourceProjectPath ? { sourceProjectPath } : null
  }
  const projectLabel = cloneTarget
    ? `Clone into ${cloneTarget.destinationDirectory.split(/[\\/]/).filter(Boolean).at(-1)}`
    : selectedProject ? selectedProject.name : sourceProjectPath ? sourceProjectPath.split(/[\\/]/).filter(Boolean).at(-1) : 'Standalone design'
  const chooseTarget = (key: string) => {
    if (key === 'standalone') { setSelectedProject(null); setSourceProjectPath(null); setCloneTarget(null); return }
    if (key === 'folder') { setSelectedProject(null); setCloneTarget(null); void window.omnidesign?.workspace.chooseProjectFolder().then((path) => { if (path) { setSourceProjectPath(path); setSelectedProject(null) } }); return }
    if (key === 'clone') { setCloneModalOpen(true); return }
    if (key.startsWith('project:')) {
      const project = projects.find((candidate) => candidate.id === key.slice('project:'.length))
      if (project) { setSelectedProject(project); setSourceProjectPath(null); setCloneTarget(null) }
    }
  }
  const chooseCloneDestination = async () => {
    const directory = await window.omnidesign?.workspace.chooseProjectFolder()
    if (directory) setCloneDestinationDirectory(directory)
  }
  const confirmCloneTarget = () => {
    if (!cloneRemoteUrl.trim() || !cloneDestinationDirectory) return
    setCloneTarget({ remoteUrl: cloneRemoteUrl.trim(), destinationDirectory: cloneDestinationDirectory })
    setSelectedProject(null)
    setSourceProjectPath(null)
    setCloneModalOpen(false)
  }
  const submit = async () => {
    const value = prompt.trim()
    if (!value || busy || !hasUsableSelection) return
    setError(null)
    try {
      await onCreate(value, selection.providerId, selection.modelId, selection.effort, target(), attachments)
      setPrompt('')
      setAttachments([])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create the design.')
    }
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && prompt.trim()) {
      event.preventDefault()
      void submit()
    }
  }
  const chooseAttachments = async (kind: AttachmentPickerKind) => {
    const selected = await window.omnidesign?.workspace.chooseAttachments(kind)
    if (selected?.length) setAttachments((current) => [...current, ...selected.filter((attachment) => !current.some((existing) => existing.path === attachment.path))])
  }

  return (
    <section className="new-design-composer" aria-label="Create a design">
      <TextField className="prompt-field" aria-label="What would you like to design?">
        <TextArea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={onKeyDown} placeholder="What would you like to design?" />
      </TextField>
      {attachments.length > 0 && <div className="attachment-list" aria-label="Attached references">{attachments.map((attachment) => <span className="attachment-chip" data-status={attachment.status} key={attachment.id}>{attachment.name}{attachment.status !== 'available' && ` (${attachment.status})`}<Button aria-label={`Remove ${attachment.name}`} onPress={() => setAttachments((current) => current.filter((candidate) => candidate.id !== attachment.id))}>×</Button></span>)}</div>}
      <div className="composer-footer">
        <div className="composer-leading">
          <AttachmentPicker onChoose={(kind) => void chooseAttachments(kind)} />
          {fixedProject
            ? <span className="project-context project-context-fixed">{fixedProject.kind === 'linked' ? <FolderIcon aria-hidden="true" /> : <DocumentDuplicateIcon aria-hidden="true" />}{fixedProject.name}</span>
            : <DropdownButton triggerClassName="project-context" popoverClassName="project-popover" placement="top" trigger={<><FolderIcon aria-hidden="true" />{projectLabel}</>}>
                <ProjectSelectionMenu projects={projects} onAction={chooseTarget} />
              </DropdownButton>}
        </div>
        <GenerationSettingsMenu providers={readyProviders} providerId={selection.providerId} modelId={selection.modelId} effort={selection.effort} onChange={applySelection} />
        <Button className="submit-prompt" aria-label="Create design" isDisabled={!prompt.trim() || busy || !hasUsableSelection} onPress={() => void submit()}>
          {busy ? <ArrowPathIcon className="spin" aria-hidden="true" /> : <ArrowRightIcon aria-hidden="true" />}
        </Button>
      </div>
      {!readyProviders.length && <div className="no-provider-notice" role="status"><ExclamationTriangleIcon aria-hidden="true" /><span><strong>Connect a provider to start generating.</strong><small>You can still open projects and review or export existing designs.</small></span><Button className="secondary-action" onPress={onOpenProviders}>Open providers</Button></div>}
      {error && <p className="generation-recovery" role="alert">{error}</p>}
      <AppModal isOpen={cloneModalOpen} onOpenChange={setCloneModalOpen} className="clone-modal" title="Clone Git repository">
        {(close) => <>
              <p>OmniDesign will create a new repository folder inside the destination you choose. Nothing is cloned until you submit this design prompt.</p>
              <div className="clone-modal-fields">
                <TextField aria-label="Git repository URL"><Input value={cloneRemoteUrl} onChange={(event) => setCloneRemoteUrl(event.target.value)} placeholder="git@github.com:team/project.git" /></TextField>
                <div className="clone-destination"><TextField aria-label="Destination folder"><Input value={cloneDestinationDirectory} onChange={(event) => setCloneDestinationDirectory(event.target.value)} placeholder="Destination folder" /></TextField><Button className="secondary-action" onPress={() => void chooseCloneDestination()}>Choose folder</Button></div>
              </div>
              <p className="clone-modal-note">For example, <code>project.git</code> will be cloned to a new <code>project</code> folder inside the destination.</p>
              <div className="clone-modal-actions"><Button className="secondary-action" onPress={close}>Cancel</Button><Button className="clone-confirm-action" isDisabled={!cloneRemoteUrl.trim() || !cloneDestinationDirectory} onPress={confirmCloneTarget}>Use repository</Button></div>
            </>}
      </AppModal>
    </section>
  )
}

function projectSubtitle(project: ProjectSummary): string {
  const kindLabel = project.kind === 'linked' ? 'Linked project' : 'Standalone'
  const designs = `${project.designCount} design${project.designCount === 1 ? '' : 's'}`
  const detail = project.latestPrompt ?? project.latestDesignTitle
  return detail ? `${kindLabel} · ${detail}` : `${kindLabel} · ${designs}`
}

function ProjectThumbnail({ title, thumbnailDataUrl }: { readonly title: string; readonly thumbnailDataUrl: string | null }) {
  if (thumbnailDataUrl) return <img alt={`Preview of ${title}`} className="mini-preview-image" src={thumbnailDataUrl} />
  return <span className="mini-preview preview-sand" aria-hidden="true"><span className="preview-rail" /><span className="preview-line preview-line-long" /><span className="preview-line" /><span className="preview-block" /></span>
}

function Home({ projects, providers, busy, activity, composerProject, onCreate, onOpen, onOpenProviders }: {
  readonly projects: readonly ProjectSummary[]
  readonly providers: readonly ProviderStatus[]
  readonly busy: boolean
  readonly activity: GenerationActivity | null
  readonly composerProject: ProjectSummary | null
  readonly onCreate: (prompt: string, providerId: ProviderId, modelId: string, effort: string | null, target: CreateDesignTarget | null, attachments: readonly DesignAttachment[]) => Promise<void>
  readonly onOpen: (project: ProjectSummary) => void
  readonly onOpenProviders: () => void
}) {
  return (
    <main className="home-main">
      <div className="home-content">
        <header className="page-heading"><h1>Start with an idea.</h1><p>Turn it into something you can see, use, and refine—without leaving your local workspace.</p></header>
        <NewDesignComposer providers={providers} busy={busy} projects={projects} initialProject={composerProject} onCreate={onCreate} onOpenProviders={onOpenProviders} />
        {busy
          ? <div className="generation-notice" role="status"><ArrowPathIcon className="spin" aria-hidden="true" /><span><strong>{activity?.detail ?? 'Setting up design repository…'}</strong></span></div>
          : activity && <div className="generation-notice" role="status"><BoltIcon aria-hidden="true" /><span><strong>{activity.stage}</strong>{activity.detail}</span></div>}
        <section className="recent-section" aria-labelledby="recent-projects">
          <div className="section-heading"><h2 id="recent-projects">Continue designing</h2><span>{projects.length ? `${projects.length} project${projects.length === 1 ? '' : 's'}` : 'Nothing here yet'}</span></div>
          <div className="recent-rows">
            {projects.slice(0, 3).map((project) => (
              <Button className="recent-row" key={project.id} onPress={() => onOpen(project)}>
                <ProjectThumbnail title={project.name} thumbnailDataUrl={project.thumbnailDataUrl} />
                <span className="recent-copy"><strong>{project.name}</strong><small>{projectSubtitle(project)}</small></span>
                <span className="recent-time"><ClockIcon aria-hidden="true" />{new Date(project.updatedAt).toLocaleDateString()}</span>
                <ArrowRightIcon className="row-arrow" aria-hidden="true" />
              </Button>
            ))}
            {!projects.length && <div className="empty-designs"><DocumentDuplicateIcon aria-hidden="true" /><strong>Your first design starts above</strong><p>A connected provider will generate, compile, validate, and save it locally.</p></div>}
          </div>
        </section>
      </div>
    </main>
  )
}

function ProjectPage({ project, providers, busy, activity, onCreate, onOpenDesign, onRenameProject, onDesignRenamed, onReconnect, onConvertToStandalone, onTrashProject, onOpenProviders }: {
  readonly project: ProjectSummary
  readonly providers: readonly ProviderStatus[]
  readonly busy: boolean
  readonly activity: GenerationActivity | null
  readonly onCreate: (prompt: string, providerId: ProviderId, modelId: string, effort: string | null, target: CreateDesignTarget | null, attachments: readonly DesignAttachment[]) => Promise<void>
  readonly onOpenDesign: (design: OmniDesignDocument) => void
  readonly onRenameProject: (project: ProjectSummary, name: string) => Promise<void>
  readonly onDesignRenamed: (design: OmniDesignDocument) => void
  readonly onReconnect: (project: ProjectSummary) => Promise<void>
  readonly onConvertToStandalone: (project: ProjectSummary) => Promise<void>
  readonly onTrashProject: (project: ProjectSummary) => Promise<void>
  readonly onOpenProviders: () => void
}) {
  const [designs, setDesigns] = useState<readonly OmniDesignDocument[]>([])
  const load = useCallback(async () => {
    const detail = await window.omnidesign?.workspace.getProject(project.id)
    if (detail) setDesigns(detail.designs)
  }, [project.id])
  useEffect(() => { void load() }, [load])
  const renameDesign = async (design: OmniDesignDocument, title: string) => {
    setDesigns((current) => current.map((candidate) => candidate.id === design.id ? { ...candidate, title } : candidate))
    try {
      const renamed = await window.omnidesign?.workspace.renameDesign(design.id, title)
      if (!renamed) throw new Error('The design could not be renamed.')
      setDesigns((current) => current.map((candidate) => candidate.id === renamed.id ? renamed : candidate))
      onDesignRenamed(renamed)
    } catch (reason) {
      setDesigns((current) => current.map((candidate) => candidate.id === design.id ? design : candidate))
      throw reason
    }
  }

  return (
    <main className="home-main">
      <div className="home-content">
        <header className="page-heading">
          <EditableTitle value={project.name} label="project" variant="page" onSave={(name) => onRenameProject(project, name)} />
          <p>{project.kind === 'linked' ? (project.sourceAvailable ? project.sourceProjectPath ?? 'Linked project' : 'Linked source folder is unavailable') : 'Standalone project'}</p>
          {project.kind === 'linked' && !project.sourceAvailable && <div className="generation-recovery" role="status"><span><strong>Source folder unavailable.</strong> Your saved designs are safe; reconnect the folder or keep this project standalone.</span><Button className="secondary-action" onPress={() => void onReconnect(project)}>Reconnect folder</Button><Button className="secondary-action" onPress={() => void onConvertToStandalone(project)}>Convert to standalone</Button></div>}
          <Button className="secondary-action" onPress={() => void onTrashProject(project)}><TrashIcon aria-hidden="true" />Remove project</Button>
        </header>
        <NewDesignComposer providers={providers} busy={busy} fixedProject={project} onCreate={onCreate} onOpenProviders={onOpenProviders} />
        {busy && <div className="generation-notice" role="status"><ArrowPathIcon className="spin" aria-hidden="true" /><span><strong>{activity?.detail ?? 'Setting up design repository…'}</strong></span></div>}
        <section className="recent-section" aria-labelledby="project-designs">
          <div className="section-heading"><h2 id="project-designs">Designs</h2><span>{designs.length ? `${designs.length} design${designs.length === 1 ? '' : 's'}` : 'No designs yet'}</span></div>
          {designs.length
            ? <div className="design-grid" role="group" aria-label="Designs in this project">
                {designs.map((design) => {
                  const activeJob = [...design.generationJobs].reverse().find((job) => ['queued', 'running'].includes(job.state))
                  const status = design.queuePaused ? 'Queue paused' : activeJob ? (activeJob.state === 'queued' ? 'Queued' : 'Generating') : 'Saved locally'
                  return (
                    <article className="design-card" key={design.id}>
                      <Button aria-label={`Open ${design.title}`} className="design-card-open" onPress={() => onOpenDesign(design)}><span className="design-card-thumb"><ProjectThumbnail title={design.title} thumbnailDataUrl={design.thumbnailDataUrl} /></span></Button>
                      <span className="design-card-body">
                        <EditableTitle value={design.title} label={`${design.title} design`} variant="card" onSave={(title) => renameDesign(design, title)} />
                        <small>{design.revisions.at(-1)?.prompt ?? design.messages.find((message) => message.role === 'user')?.text ?? 'Ready for a first direction'}</small>
                        <span className="design-card-meta"><span>{new Date(design.updatedAt).toLocaleDateString()}</span><span>{design.lastSelection.providerId === 'mock' ? 'Development provider' : `${design.lastSelection.providerId} · ${design.lastSelection.modelId}`}</span></span>
                        <span className="design-card-status" data-busy={Boolean(activeJob) || undefined}>{status}</span>
                      </span>
                    </article>
                  )
                })}
              </div>
            : <div className="empty-designs"><DocumentDuplicateIcon aria-hidden="true" /><strong>No designs in this project yet</strong><p>Describe a design above to add the first one.</p></div>}
        </section>
      </div>
    </main>
  )
}

function PreviewSurface({ design, freezeFrame }: { readonly design: OmniDesignDocument; readonly freezeFrame: string | null }) {
  const surface = useRef<HTMLDivElement>(null)
  const revisionId = design.selectedRevisionId

  useEffect(() => {
    const element = surface.current
    const api = window.omnidesign?.preview
    if (!element || !api || !revisionId) return
    const readBounds = () => {
      const rectangle = element.getBoundingClientRect()
      return { x: Math.round(rectangle.x), y: Math.round(rectangle.y), width: Math.max(1, Math.round(rectangle.width)), height: Math.max(1, Math.round(rectangle.height)) }
    }
    void api.show({ designId: design.id, revisionId, bounds: readBounds() })
    if (typeof ResizeObserver === 'undefined') return () => { void api.hide() }
    const resize = () => { void api.resize(readBounds()) }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    window.addEventListener('resize', resize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', resize)
      void api.hide()
    }
  }, [design.id, revisionId])

  return (
    <div className="preview-surface" ref={surface}>
      {!revisionId && <p>Preview appears after the first valid revision.</p>}
      {freezeFrame && <img className="preview-freeze" src={freezeFrame} alt="" aria-hidden="true" />}
    </div>
  )
}

const layoutModes: readonly { readonly id: LayoutMode; readonly label: string; readonly icon: Icon }[] = [
  { id: 'split', label: 'Split view', icon: ViewColumnsIcon },
  { id: 'conversation', label: 'Conversation only', icon: ChatBubbleLeftRightIcon },
  { id: 'preview', label: 'Preview only', icon: WindowIcon },
  { id: 'popped', label: 'Pop out preview', icon: ArrowTopRightOnSquareIcon },
]

function LayoutMenu({ mode, onChange }: { readonly mode: LayoutMode; readonly onChange: (mode: LayoutMode) => void }) {
  const current = layoutModes.find((candidate) => candidate.id === mode) ?? layoutModes[0]
  const CurrentIcon = current.icon
  return (
    <DropdownButton
      label={`Layout: ${current.label}`}
      triggerClassName="toolbar-button"
      popoverClassName="project-popover layout-menu"
      placement="bottom"
      trigger={<><CurrentIcon aria-hidden="true" />{current.label}</>}
    >
      <Menu aria-label="Workspace layout" onAction={(key) => onChange(key as LayoutMode)}>
        {layoutModes.map((option) => {
          const OptionIcon = option.icon
          return <MenuItem id={option.id} key={option.id} textValue={option.label}><span><OptionIcon aria-hidden="true" />{option.label}</span>{mode === option.id && <CheckCircleIcon aria-hidden="true" />}</MenuItem>
        })}
      </Menu>
    </DropdownButton>
  )
}

function DesignWorkspace({ design, providers, projects, associationNotice, activity, busy, detailLevel, onBack, onChange, onRename, onTrash, onAssociate, onAssociateAndRestart, onDismissAssociation, onOpenProviders }: {
  readonly design: OmniDesignDocument
  readonly providers: readonly ProviderStatus[]
  readonly projects: readonly ProjectSummary[]
  readonly associationNotice: { readonly projectId: string; readonly projectName: string; readonly mode: 'associated' | 'suggested' } | null
  readonly activity: GenerationActivity | null
  readonly busy: boolean
  readonly detailLevel: 'full' | 'concise'
  readonly onBack: () => void
  readonly onChange: (design: OmniDesignDocument) => void
  readonly onRename: (design: OmniDesignDocument, title: string) => Promise<OmniDesignDocument>
  readonly onTrash: (design: OmniDesignDocument) => Promise<void>
  readonly onAssociate: (design: OmniDesignDocument, projectId: string) => Promise<void>
  readonly onAssociateAndRestart: (design: OmniDesignDocument, projectId: string) => Promise<void>
  readonly onDismissAssociation: () => void
  readonly onOpenProviders: () => void
}) {
  const [draft, setDraft] = useState(design.draft)
  const [attachments, setAttachments] = useState<readonly DesignAttachment[]>(design.draftAttachments)
  const [dropdownOverlayOpen, setDropdownOverlayOpen] = useState(false)
  const [associateCloneOpen, setAssociateCloneOpen] = useState(false)
  const [associateCloneUrl, setAssociateCloneUrl] = useState('')
  const [associateCloneDestination, setAssociateCloneDestination] = useState('')
  const [associateCloneError, setAssociateCloneError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ readonly tone: 'success' | 'error'; readonly message: string; readonly detail?: string } | null>(null)
  const [associatingClone, setAssociatingClone] = useState(false)
  const [freezeFrame, setFreezeFrame] = useState<string | null>(null)
  const [conversationWidth, setConversationWidth] = useState(design.layout.conversationWidth)
  const [mode, setMode] = useState<LayoutMode>(design.layout.mode)
  const [selection, setSelection] = useState<GenerationSelection>(design.lastSelection)
  const split = useRef<HTMLDivElement>(null)
  const openDropdownCount = useRef(0)
  const selectedIsHead = design.selectedRevisionId === design.activeRevisionId
  const selectedRevision = design.revisions.find((revision) => revision.id === design.selectedRevisionId)
  const latestInvalidCandidate = design.invalidCandidates.at(-1)
  const runningJob = design.generationJobs.find((job) => job.state === 'running')
  const queuedJobs = design.generationJobs.filter((job) => job.state === 'queued')
  const activeJob = runningJob ?? queuedJobs[0]
  const latestJob = design.generationJobs.at(-1)
  const retryableJob = design.queuePaused
    ? [...design.generationJobs].reverse().find((job) => ['failed', 'cancelled', 'interrupted'].includes(job.state))
    : latestJob && ['failed', 'cancelled', 'interrupted'].includes(latestJob.state) ? latestJob : undefined
  const stoppedGeneration = retryableJob ? describeStoppedGeneration(retryableJob) : null
  const api = window.omnidesign?.workspace
  const readyProviders = providers.filter((provider) => provider.installed && provider.authenticated && provider.models.length)
  const hasUsableSelection = readyProviders.some((provider) => provider.id === selection.providerId && provider.models.some((model) => model.id === selection.modelId))
  const runWorkspaceAction = async <T,>(action: () => Promise<T>, failureMessage: string): Promise<T | undefined> => {
    setFeedback(null)
    try {
      return await action()
    } catch (reason) {
      setFeedback({
        tone: 'error',
        message: failureMessage,
        ...(reason instanceof Error && reason.message ? { detail: reason.message } : {}),
      })
      return undefined
    }
  }

  // The isolated preview is a native layer painted above the DOM. While a header overlay sits over the
  // docked preview, capture its current frame, show that still image on the preview surface, then hide
  // the native layer so the overlay paints cleanly over the frozen frame — with no visible gap.
  const overlayCoversPreview = dropdownOverlayOpen || associateCloneOpen
  const coverPreviewForOverlay = useCallback(() => {
    const preview = window.omnidesign?.preview
    if (!preview) return
    const frame = preview.freeze()
    void preview.setSuspended(true)
    void frame.then((captured) => setFreezeFrame(captured))
  }, [])
  const previewOverlay = useMemo(() => ({
    open: () => {
      if (openDropdownCount.current === 0) {
        coverPreviewForOverlay()
        setDropdownOverlayOpen(true)
      }
      openDropdownCount.current += 1
    },
    close: () => {
      openDropdownCount.current = Math.max(0, openDropdownCount.current - 1)
      if (openDropdownCount.current === 0) setDropdownOverlayOpen(false)
    },
  }), [coverPreviewForOverlay])
  useLayoutEffect(() => {
    const preview = window.omnidesign?.preview
    if (!preview) return
    if (!overlayCoversPreview) {
      void preview.setSuspended(false)
      setFreezeFrame(null)
    }
  }, [overlayCoversPreview])
  useEffect(() => setDraft(design.draft), [design.id, design.draft])
  useEffect(() => setAttachments(design.draftAttachments), [design.id, design.draftAttachments])
  useEffect(() => setConversationWidth(design.layout.conversationWidth), [design.id, design.layout.conversationWidth])
  useEffect(() => setMode(design.layout.mode), [design.id, design.layout.mode])
  useEffect(() => setSelection(design.lastSelection), [design.id])
  const applySelection = (next: GenerationSelection) => {
    setSelection(next)
    const save = window.omnidesign?.workspace.saveSelection?.(design.id, next)
    if (save) void save.catch((reason: unknown) => setFeedback({ tone: 'error', message: 'Generation settings could not be saved.', ...(reason instanceof Error ? { detail: reason.message } : {}) }))
  }
  useEffect(() => {
    if (!api) return
    const timer = window.setTimeout(() => { void api.saveDraft(design.id, draft, attachments).catch((reason: unknown) => setFeedback({ tone: 'error', message: 'Your draft could not be saved.', ...(reason instanceof Error ? { detail: reason.message } : {}) })) }, 300)
    return () => window.clearTimeout(timer)
  }, [api, design.id, draft, attachments])
  useEffect(() => {
    if (!api) return
    const timer = window.setTimeout(() => { void api.saveLayout(design.id, { conversationWidth, mode }).catch((reason: unknown) => setFeedback({ tone: 'error', message: 'The workspace layout could not be saved.', ...(reason instanceof Error ? { detail: reason.message } : {}) })) }, 250)
    return () => window.clearTimeout(timer)
  }, [api, conversationWidth, mode, design.id])
  // Hide the docked preview whenever the conversation-only layout is active so a preview from a
  // previous design or layout does not linger over the workspace.
  useEffect(() => {
    if (mode === 'conversation') void window.omnidesign?.preview.hide()
  }, [mode, design.id])
  // Close the popped-out preview window when the popped layout is left or the workspace unmounts. Kept
  // separate from the pop-out effect so a revision change reloads the existing window instead of
  // recreating it.
  useEffect(() => {
    if (mode !== 'popped') return
    return () => { void window.omnidesign?.preview.hide() }
  }, [mode])
  // While the popped-out layout is active, move the shared preview into its own window; a later
  // revision reuses that window and reloads its content.
  useEffect(() => {
    const preview = window.omnidesign?.preview
    if (!preview || mode !== 'popped' || !design.selectedRevisionId) return
    void preview.popOut({ designId: design.id, revisionId: design.selectedRevisionId })
  }, [mode, design.id, design.selectedRevisionId])
  // If the user closes the popped-out preview window, return to the docked split layout.
  useEffect(() => {
    const preview = window.omnidesign?.preview
    if (!preview) return
    return preview.onPoppedIn((event) => { if (event.designId === design.id) setMode('split') })
  }, [design.id])

  const updateConversationWidth = (clientX: number) => {
    const bounds = split.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0) return
    setConversationWidth(Math.min(65, Math.max(35, ((clientX - bounds.left) / bounds.width) * 100)))
  }

  const submit = async () => {
    if (!api || !draft.trim() || busy || !selectedIsHead || !hasUsableSelection) return
    const prompt = draft.trim()
    const submittedAttachments = attachments
    setDraft('')
    setAttachments([])
    void api.saveDraft(design.id, '', [])
    const updated = await runWorkspaceAction(() => api.generate(design.id, prompt, selection.providerId, selection.modelId, selection.effort ?? undefined, submittedAttachments), 'The prompt could not be submitted. Your draft has been restored.')
    if (updated) onChange(updated)
    else {
      setDraft(prompt)
      setAttachments(submittedAttachments)
    }
  }
  const selectRevision = async (revisionId: string) => {
    if (!api || revisionId === design.selectedRevisionId) return
    const updated = await runWorkspaceAction(() => api.selectRevision(design.id, revisionId), 'That revision could not be opened.')
    if (updated) onChange(updated)
  }
  const restore = async () => {
    if (!api || !design.selectedRevisionId) return
    const updated = await runWorkspaceAction(() => api.restoreRevision(design.id, design.selectedRevisionId!), 'That revision could not be restored.')
    if (updated) onChange(updated)
  }
  const exportRevision = async () => {
    if (!api || !design.selectedRevisionId) return
    const result = await runWorkspaceAction(() => api.exportRevision(design.id, design.selectedRevisionId!), 'The design could not be exported.')
    if (result && !result.canceled) setFeedback({ tone: 'success', message: 'Export ready.', ...(result.filePath ? { detail: result.filePath } : {}) })
  }
  const cancelGeneration = async () => {
    if (!api || !runningJob) return
    const cancelled = await runWorkspaceAction(() => api.cancelGeneration(runningJob.id), 'Generation could not be stopped.')
    if (!cancelled) return
    const updated = await runWorkspaceAction(() => api.get(design.id), 'The stopped generation could not be refreshed.')
    if (updated) onChange(updated)
  }
  const retryGeneration = async () => {
    if (!api || !retryableJob) return
    const retry = await runWorkspaceAction(() => api.retryGeneration(retryableJob.id), 'Generation could not be retried.')
    if (!retry) return
    const updated = await runWorkspaceAction(() => api.get(design.id), 'The retried generation could not be refreshed.')
    if (updated) onChange(updated)
  }
  const removeGeneration = async (jobId: string) => {
    if (!api || !queuedJobs.some((job) => job.id === jobId)) return
    const removed = await runWorkspaceAction(() => api.removeGeneration(jobId), 'The queued prompt could not be removed.')
    if (!removed) return
    const updated = await runWorkspaceAction(() => api.get(design.id), 'The queue could not be refreshed.')
    if (updated) onChange(updated)
  }
  const continueGeneration = async () => {
    if (!api || !retryableJob) return
    const continued = await runWorkspaceAction(() => api.continueGeneration(retryableJob.id), 'Generation could not continue.')
    if (!continued) return
    const updated = await runWorkspaceAction(() => api.get(design.id), 'The continued generation could not be refreshed.')
    if (updated) onChange(updated)
  }
  const resumeGenerationQueue = async () => {
    if (!api || !design.queuePaused || retryableJob) return
    const updated = await runWorkspaceAction(() => api.resumeGenerationQueue(design.id), 'The queued work could not be resumed.')
    if (updated) onChange(updated)
  }
  const chooseAttachments = async (kind: AttachmentPickerKind) => {
    if (!api) return
    const selected = await runWorkspaceAction(() => api.chooseAttachments(kind), 'References could not be attached.')
    if (selected?.length) setAttachments((current) => [...current, ...selected.filter((attachment) => !current.some((existing) => existing.path === attachment.path))])
  }
  const adaptToAssociatedProject = async () => {
    if (!api || !associationNotice || busy) return
    const updated = await runWorkspaceAction(() => api.generate(design.id, `Adapt this design to the established design language of ${associationNotice.projectName}. Preserve its purpose while aligning visual language, interaction patterns, and relevant project conventions.`, selection.providerId, selection.modelId, selection.effort ?? undefined, attachments), 'The adaptation prompt could not be submitted.')
    if (updated) { onChange(updated); onDismissAssociation() }
  }
  const chooseAssociationTarget = async (key: string) => {
    if (!api) return
    if (key === 'folder') {
      const folder = await api.chooseProjectFolder()
      if (!folder) return
      const project = await runWorkspaceAction(() => api.registerLinkedProject(folder), 'The selected folder could not be linked.')
      if (project) await runWorkspaceAction(() => onAssociate(design, project.id), 'The design could not be associated with that project.')
      return
    }
    if (key === 'clone') {
      coverPreviewForOverlay()
      setAssociateCloneError(null)
      setAssociateCloneOpen(true)
      return
    }
    if (key.startsWith('project:')) await runWorkspaceAction(() => onAssociate(design, key.slice('project:'.length)), 'The design could not be associated with that project.')
  }
  const removeDesign = async () => { await runWorkspaceAction(() => onTrash(design), 'The design could not be moved to Trash.') }
  const renameDesign = async (title: string) => {
    const updated = await runWorkspaceAction(() => onRename(design, title), 'The design could not be renamed.')
    if (!updated) throw new Error('The design could not be renamed.')
    onChange(updated)
  }
  const associateSuggested = async () => {
    if (associationNotice) await runWorkspaceAction(() => onAssociate(design, associationNotice.projectId), 'The design could not be associated with that project.')
  }
  const restartSuggested = async () => {
    if (associationNotice) await runWorkspaceAction(() => onAssociateAndRestart(design, associationNotice.projectId), 'The design could not be associated and restarted.')
  }
  const chooseAssociateCloneDestination = async () => {
    const folder = await api?.chooseProjectFolder()
    if (folder) setAssociateCloneDestination(folder)
  }
  const confirmAssociateClone = async () => {
    if (!api || !associateCloneUrl.trim() || !associateCloneDestination || associatingClone) return
    setAssociatingClone(true)
    setAssociateCloneError(null)
    try {
      const project = await api.cloneProject(associateCloneUrl.trim(), associateCloneDestination)
      await onAssociate(design, project.id)
      setAssociateCloneOpen(false)
    } catch (reason) {
      setAssociateCloneError(reason instanceof Error ? reason.message : 'Unable to clone and associate the repository.')
    } finally {
      setAssociatingClone(false)
    }
  }

  const previewStatus = selectedRevision
    ? selectedRevision.diagnostics.length ? `${selectedRevision.diagnostics.length} diagnostic${selectedRevision.diagnostics.length === 1 ? '' : 's'} captured` : 'Offline · validated'
    : 'Waiting for revision'
  const providerStatus = selection.providerId === 'mock' ? 'Development provider' : `${selection.providerId} · ${selection.modelId}`

  const conversationPane = (
    <section className="conversation-pane" aria-label="Design conversation">
      <div className="conversation-feed">
        {buildConversationFeed(design, detailLevel).map((item) => item.kind === 'message'
          ? <article className={`conversation-message message-${item.message.role}`} key={item.message.id}><span>{item.message.role === 'user' ? 'You' : 'OmniDesign'}</span><p>{item.message.text}</p>{item.message.attachments?.length ? <div className="message-attachments" aria-label="References supplied with this prompt">{item.message.attachments.map((attachment) => <Button className="attachment-chip attachment-link" data-status={attachment.status} key={attachment.id} isDisabled={attachment.status !== 'available'} onPress={() => void api?.openAttachment(attachment)}>{attachment.name}{attachment.status !== 'available' && ` (${attachment.status})`}</Button>)}</div> : null}</article>
          : item.kind === 'activity'
          ? <GenerationActivitySection id={item.id} key={item.id} steps={item.steps} />
          : <div className={`conversation-step step-${item.step.stage}`} key={item.step.id}><span className="conversation-step-label">{item.step.label}</span>{item.step.detail && <span className="conversation-step-detail">{item.step.detail}</span>}</div>)}
        {activity && (runningJob || (queuedJobs.length > 0 && !design.queuePaused)) && <div className="generation-progress" role="status"><ArrowPathIcon className="spin" aria-hidden="true" /><span><strong>{activity.stage}</strong>{activity.detail}</span>{runningJob && <Button className="secondary-action" onPress={() => void cancelGeneration()}><StopIcon aria-hidden="true" />Stop</Button>}</div>}
        {queuedJobs.length > 0 && <section className="workspace-queue" aria-label="Queued prompts"><header><span><strong>{queuedJobs.length} queued prompt{queuedJobs.length === 1 ? '' : 's'}</strong><small>{design.queuePaused ? 'Waiting for you to resume generation' : runningJob ? 'Runs after the current request' : 'Waiting to start'}</small></span>{design.queuePaused && !retryableJob && <Button className="secondary-action" onPress={() => void resumeGenerationQueue()}>Resume queue</Button>}</header>{queuedJobs.map((job) => <article key={job.id}><span><strong>{job.prompt}</strong><small>{job.providerId === 'mock' ? 'Development provider' : `${job.providerId} · ${job.modelId}`}</small></span><Button className="text-button" onPress={() => void removeGeneration(job.id)}>Remove</Button></article>)}</section>}
        {feedback && <div className="workspace-feedback" data-tone={feedback.tone} role={feedback.tone === 'error' ? 'alert' : 'status'}><span><strong>{feedback.message}</strong>{feedback.detail && <small>{feedback.detail}</small>}</span><Button className="text-button" onPress={() => setFeedback(null)}>Dismiss</Button></div>}
        {!runningJob && retryableJob && stoppedGeneration && <div className="generation-recovery" role="status"><span><strong>{stoppedGeneration.title}</strong>{stoppedGeneration.message}{retryableJob.error && <details className="generation-recovery-details"><summary>Technical details</summary><pre>{retryableJob.error}</pre></details>}</span>{stoppedGeneration.openProviders && <Button className="secondary-action" onPress={onOpenProviders}>Open providers</Button>}<Button className="secondary-action" onPress={() => void continueGeneration()}>Continue</Button><Button className="secondary-action" onPress={() => void retryGeneration()}><ArrowPathIcon aria-hidden="true" />Retry</Button></div>}
        {latestInvalidCandidate && <section className="invalid-candidate-notice" role="alert">
          <strong>Latest candidate was not activated</strong>
          <p>{latestInvalidCandidate.diagnostic}</p>
          <details><summary>Technical details</summary><pre>{latestInvalidCandidate.html}</pre></details>
        </section>}
        {associationNotice?.mode === 'associated' && <div className="generation-recovery" role="status"><span><strong>Design associated with {associationNotice.projectName}.</strong>Optionally adapt this design to the linked project's design language in a new revision.</span><Button className="secondary-action" onPress={() => void adaptToAssociatedProject()}>Adapt design</Button><Button className="secondary-action" onPress={onDismissAssociation}>Keep current design</Button></div>}
        {associationNotice?.mode === 'suggested' && <div className="generation-recovery" role="status"><span><strong>Possible project match: {associationNotice.projectName}.</strong>This standalone request mentions the linked project; generation can continue while you associate it.</span><Button className="secondary-action" onPress={() => void associateSuggested()}>Associate project</Button>{activeJob && <Button className="secondary-action" onPress={() => void restartSuggested()}>Associate and restart</Button>}<Button className="secondary-action" onPress={onDismissAssociation}>Dismiss</Button></div>}
      </div>
      {!selectedIsHead && <div className="historical-banner"><ClockIcon aria-hidden="true" /><span><strong>Viewing an earlier revision</strong>Restore it as a new head before prompting.</span><Button className="secondary-action" onPress={() => void restore()}>Restore revision</Button></div>}
      <div className="workspace-composer">
        <TextField aria-label="Request a design change"><TextArea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Describe the next change…" disabled={!selectedIsHead} onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() }
        }} /></TextField>
        {attachments.length > 0 && <div className="attachment-list" aria-label="Attached references">{attachments.map((attachment) => <span className="attachment-chip" data-status={attachment.status} key={attachment.id}>{attachment.name}{attachment.status !== 'available' && ` (${attachment.status})`}<Button aria-label={`Remove ${attachment.name}`} onPress={() => setAttachments((current) => current.filter((candidate) => candidate.id !== attachment.id))}>×</Button></span>)}</div>}
        <div className="workspace-composer-footer"><AttachmentPicker placement="top" onChoose={(kind) => void chooseAttachments(kind)} /><GenerationSettingsMenu providers={readyProviders} providerId={selection.providerId} modelId={selection.modelId} effort={selection.effort} onChange={applySelection} /><Button className="submit-prompt" aria-label="Send change" isDisabled={!draft.trim() || busy || !selectedIsHead || !hasUsableSelection} onPress={() => void submit()}><ArrowRightIcon aria-hidden="true" /></Button></div>
        {!hasUsableSelection && <div className="no-provider-notice no-provider-notice-workspace" role="status"><ExclamationTriangleIcon aria-hidden="true" /><span><strong>{readyProviders.length ? 'The selected provider or model is unavailable.' : 'Generation is unavailable.'}</strong><small>{readyProviders.length ? 'Choose an available provider before sending this draft.' : 'Connect a provider to send this draft. Existing history and export remain available.'}</small></span><Button className="secondary-action" onPress={onOpenProviders}>Open providers</Button></div>}
      </div>
    </section>
  )

  const previewPane = (
    <section className="preview-pane" aria-label="Generated design preview">
      <div className="preview-toolbar"><span><CheckCircleIcon aria-hidden="true" />Isolated preview</span><small>{previewStatus}</small></div>
      <PreviewSurface design={design} freezeFrame={freezeFrame} />
    </section>
  )

  return (
    <PreviewOverlayContext.Provider value={previewOverlay}>
    <main className="workspace-main">
      <header className="workspace-toolbar">
        <IconButton label="Back" icon={ArrowLeftIcon} onPress={onBack} />
        <span className="workspace-title"><EditableTitle value={design.title} label="design" variant="workspace" onSave={renameDesign} /><small>{providerStatus} · {busy ? activity?.stage ?? 'Working' : 'Saved locally'}</small></span>
        <div className="toolbar-actions">
            <LayoutMenu mode={mode} onChange={setMode} />
          <DropdownButton
            triggerClassName="toolbar-button"
            popoverClassName="history-popover"
            placement="bottom"
            trigger={<><ClockIcon aria-hidden="true" />History · {design.revisions.length}</>}
          >
            <Menu aria-label="Revision history" onAction={(key) => void selectRevision(String(key))}>
              {[...design.revisions].reverse().map((revision, index) => (
                <MenuItem id={revision.id} key={revision.id} textValue={revision.prompt} className={revision.id === design.selectedRevisionId ? 'history-row history-row-active' : 'history-row'}>
                  {revision.thumbnailDataUrl
                    ? <img alt={`Preview of revision ${index === 0 ? 'current head' : index + 1}`} className="history-thumbnail" src={revision.thumbnailDataUrl} />
                    : <span className="history-thumbnail history-thumbnail-placeholder" aria-hidden="true" />}
                  <span><strong>{index === 0 ? `Current head · ${new Date(revision.createdAt).toLocaleString()}` : new Date(revision.createdAt).toLocaleString()}</strong><small>{revision.prompt}</small></span>
                </MenuItem>
              ))}
            </Menu>
          </DropdownButton>
            {!design.sourceProjectPath && <DropdownButton triggerClassName="toolbar-button" popoverClassName="project-popover" placement="bottom" trigger={<><FolderIcon aria-hidden="true" />Associate</>}>
              <ProjectSelectionMenu projects={projects.filter((project) => project.id !== design.projectId)} includeStandalone={false} onAction={(key) => void chooseAssociationTarget(key)} />
            </DropdownButton>}
          <Button className="toolbar-button" onPress={() => void exportRevision()} isDisabled={!design.selectedRevisionId}><ArrowDownTrayIcon aria-hidden="true" />Export</Button>
          <Button className="toolbar-button" onPress={() => void removeDesign()}><TrashIcon aria-hidden="true" />Remove</Button>
        </div>
      </header>
      <AppModal isOpen={associateCloneOpen} onOpenChange={setAssociateCloneOpen} className="clone-modal" title="Clone and associate repository">
        {(close) => <>
          <p>OmniDesign will clone the repository into a new folder inside the destination you choose, then associate this design with it.</p>
          <div className="clone-modal-fields">
            <TextField aria-label="Git repository URL"><Input value={associateCloneUrl} onChange={(event) => setAssociateCloneUrl(event.target.value)} placeholder="git@github.com:team/project.git" /></TextField>
            <div className="clone-destination"><TextField aria-label="Destination folder"><Input value={associateCloneDestination} onChange={(event) => setAssociateCloneDestination(event.target.value)} placeholder="Destination folder" /></TextField><Button className="secondary-action" onPress={() => void chooseAssociateCloneDestination()}>Choose folder</Button></div>
          </div>
          <p className="clone-modal-note">For example, <code>project.git</code> will be cloned to a new <code>project</code> folder inside the destination.</p>
          {associateCloneError && <p className="generation-recovery" role="alert">{associateCloneError}</p>}
          <div className="clone-modal-actions"><Button className="secondary-action" onPress={close}>Cancel</Button><Button className="clone-confirm-action" isDisabled={!associateCloneUrl.trim() || !associateCloneDestination || associatingClone} onPress={() => void confirmAssociateClone()}>{associatingClone ? 'Cloning…' : 'Clone and associate'}</Button></div>
        </>}
      </AppModal>
      {mode === 'split'
        ? <div className="workspace-split" ref={split} style={{ gridTemplateColumns: `minmax(380px, ${conversationWidth}%) 8px minmax(0, 1fr)` }}>
            {conversationPane}
            <div
              aria-label="Resize conversation and preview panels"
              aria-orientation="vertical"
              aria-valuemax={65}
              aria-valuemin={35}
              aria-valuenow={Math.round(conversationWidth)}
              className="workspace-divider"
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft') { event.preventDefault(); setConversationWidth((current) => Math.max(35, current - 2)) }
                if (event.key === 'ArrowRight') { event.preventDefault(); setConversationWidth((current) => Math.min(65, current + 2)) }
                if (event.key === 'Home') { event.preventDefault(); setConversationWidth(35) }
                if (event.key === 'End') { event.preventDefault(); setConversationWidth(65) }
              }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId)
                updateConversationWidth(event.clientX)
              }}
              onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) updateConversationWidth(event.clientX) }}
              role="separator"
              tabIndex={0}
            />
            {previewPane}
          </div>
        : mode === 'preview'
        ? <div className="workspace-single">{previewPane}</div>
        : <div className="workspace-single">
            {mode === 'popped' && <div className="popped-preview-note" role="status"><WindowIcon aria-hidden="true" /><span>Preview is open in a separate window.</span><Button className="secondary-action" onPress={() => setMode('split')}>Dock preview</Button></div>}
            {conversationPane}
          </div>}
    </main>
    </PreviewOverlayContext.Provider>
  )
}

const developmentProvider: ProviderStatus = {
  id: 'mock',
  name: 'Development provider',
  installed: true,
  authenticated: true,
  detail: 'Available for local development and automated testing.',
  models: [{ id: 'mock-v1', name: 'Mock v1', effortLevels: [] }],
}

function useProviders(): { readonly label: string; readonly providers: readonly ProviderStatus[]; readonly loading: boolean; readonly error: string | null; readonly refresh: () => void } {
  const developmentEnabled = import.meta.env.DEV || window.omnidesign?.providers.developmentProviderEnabled
  const [label, setLabel] = useState('Development provider')
  const [providers, setProviders] = useState<ProviderStatus[]>(developmentEnabled ? [developmentProvider] : [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(() => {
    const api = window.omnidesign?.providers
    if (!api) return
    setLoading(true)
    setError(null)
    void api.discover().then((available) => {
      setProviders(available)
      const provider = available.find((candidate) => candidate.installed && candidate.authenticated)
      setLabel(provider ? `${provider.name} available · Development provider active` : 'Development provider')
    }).catch((reason: unknown) => {
      setProviders(developmentEnabled ? [developmentProvider] : [])
      setLabel('Development provider')
      setError(reason instanceof Error && reason.message ? reason.message : 'Provider discovery failed unexpectedly.')
    }).finally(() => setLoading(false))
  }, [developmentEnabled])
  useEffect(() => {
    refresh()
  }, [refresh])
  return { label, providers, loading, error, refresh }
}

export function App() {
  const [designs, setDesigns] = useState<OmniDesignDocument[]>([])
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [trashItems, setTrashItems] = useState<TrashItem[]>([])
  const [activeDesign, setActiveDesign] = useState<OmniDesignDocument | null>(null)
  const [activeProject, setActiveProject] = useState<ProjectSummary | null>(null)
  const [composerProject, setComposerProject] = useState<ProjectSummary | null>(null)
  const [associationNotice, setAssociationNotice] = useState<{ readonly designId: string; readonly projectId: string; readonly projectName: string; readonly mode: 'associated' | 'suggested' } | null>(null)
  const [activitiesByDesign, setActivitiesByDesign] = useState<Record<string, GenerationActivity>>({})
  const [creating, setCreating] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [providersOpen, setProvidersOpen] = useState(false)
  const [generationsOpen, setGenerationsOpen] = useState(false)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [generationDetail, setGenerationDetail] = useState<'full' | 'concise'>('full')
  const providerState = useProviders()
  const workspaceApi = window.omnidesign?.workspace

  const updateDesign = useCallback((design: OmniDesignDocument) => {
    setActiveDesign((current) => current?.id === design.id ? design : current)
    setDesigns((current) => current.map((candidate) => candidate.id === design.id ? design : candidate))
  }, [])

  const refresh = useCallback(async () => {
    if (!workspaceApi) return
    const [nextDesigns, nextProjects, nextTrash] = await Promise.all([workspaceApi.list(), workspaceApi.listProjects(), workspaceApi.listTrash()])
    setDesigns(nextDesigns)
    setProjects(nextProjects)
    setTrashItems(nextTrash)
  }, [workspaceApi])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const api = window.omnidesign?.settings
    if (!api) return
    void api.getTheme().then((savedTheme) => {
      setTheme(savedTheme)
      document.documentElement.dataset.theme = savedTheme
    })
    void api.getNotificationsEnabled().then(setNotificationsEnabled)
    void api.getGenerationDetail().then(setGenerationDetail)
  }, [])
  useEffect(() => {
    if (!workspaceApi) return
    return workspaceApi.onActivity((next) => {
      setActivitiesByDesign((current) => ({ ...current, [next.designId]: next }))
      const finished = ['complete', 'failed', 'cancelled', 'interrupted'].includes(next.stage)
      void workspaceApi.get(next.designId).then((design) => { if (design) updateDesign(design) })
      if (finished) void refresh()
    })
  }, [refresh, updateDesign, workspaceApi])
  useEffect(() => workspaceApi?.onChanged(({ designId }) => {
    void workspaceApi.get(designId).then((design) => { if (design) updateDesign(design) })
    void refresh()
  }), [refresh, updateDesign, workspaceApi])
  useEffect(() => window.omnidesign?.preview.onDiagnostic((event) => {
    if (event.designId !== activeDesign?.id || !workspaceApi) return
    void workspaceApi.get(event.designId).then((design) => { if (design) updateDesign(design) })
  }), [activeDesign?.id, updateDesign, workspaceApi])
  useEffect(() => window.omnidesign?.preview.onThumbnail((event) => {
    void refresh()
    if (event.designId !== activeDesign?.id || !workspaceApi) return
    void workspaceApi.get(event.designId).then((design) => { if (design) updateDesign(design) })
  }), [activeDesign?.id, refresh, updateDesign, workspaceApi])

  const create = async (prompt: string, providerId: ProviderId, modelId: string, effort: string | null, target: CreateDesignTarget | null, attachments: readonly DesignAttachment[]) => {
    if (!workspaceApi) return
    setCreating(true)
    try {
      const design = attachments.length
        ? await workspaceApi.create(prompt, providerId, modelId, effort ?? undefined, target, attachments)
        : await workspaceApi.create(prompt, providerId, modelId, effort ?? undefined, target)
      setActiveDesign(design)
      if (!target) {
        const availableProjects = projects.length ? projects : await workspaceApi.listProjects()
        const matchingProject = availableProjects.find((project) => project.kind === 'linked' && prompt.toLocaleLowerCase().includes(project.name.toLocaleLowerCase()))
        if (matchingProject) setAssociationNotice({ designId: design.id, projectId: matchingProject.id, projectName: matchingProject.name, mode: 'suggested' })
      }
      await refresh()
      if (activeProject) {
        const detail = await workspaceApi.getProject(activeProject.id)
        if (detail) setActiveProject(detail.project)
      }
    } finally {
      setCreating(false)
    }
  }
  const changeTheme = (nextTheme: 'dark' | 'light') => {
    setTheme(nextTheme)
    document.documentElement.dataset.theme = nextTheme
    void window.omnidesign?.settings.saveTheme(nextTheme)
  }
  const closePanels = () => { setGenerationsOpen(false); setProvidersOpen(false); setSettingsOpen(false); setDiagnosticsOpen(false); setTrashOpen(false) }
  const home = () => { void window.omnidesign?.preview.hide(); closePanels(); setActiveDesign(null); setActiveProject(null); setComposerProject(null); void refresh() }
  // The "+" on a sidebar project row jumps home with that project pre-filled in the composer target.
  const startDesignInProject = (project: ProjectSummary) => { void window.omnidesign?.preview.hide(); closePanels(); setActiveDesign(null); setActiveProject(null); setComposerProject(project) }
  const openSettings = () => { void window.omnidesign?.preview.hide(); closePanels(); setActiveDesign(null); setActiveProject(null); setSettingsOpen(true) }
  const openProviders = () => { void window.omnidesign?.preview.hide(); closePanels(); setActiveDesign(null); setActiveProject(null); setProvidersOpen(true); providerState.refresh() }
  const openGenerations = () => { void window.omnidesign?.preview.hide(); closePanels(); setActiveDesign(null); setActiveProject(null); setGenerationsOpen(true); void refresh() }
  const openDiagnostics = () => { void window.omnidesign?.preview.hide(); closePanels(); setActiveDesign(null); setActiveProject(null); setDiagnosticsOpen(true); void refresh() }
  const openTrash = () => { void window.omnidesign?.preview.hide(); closePanels(); setActiveDesign(null); setActiveProject(null); setTrashOpen(true); void refresh() }
  const openDesign = (design: OmniDesignDocument) => {
    closePanels()
    const project = projects.find((candidate) => candidate.id === design.projectId)
    setActiveProject(project && project.kind === 'linked' && project.designCount > 1 ? project : null)
    setActiveDesign(design)
  }
  const openDiagnostic = async (design: OmniDesignDocument, revisionId: string | null) => {
    const current = await workspaceApi?.get(design.id) ?? design
    const selected = revisionId && current.selectedRevisionId !== revisionId
      ? await workspaceApi?.selectRevision(current.id, revisionId) ?? current
      : current
    openDesign(selected)
  }
  const openProjectDesign = (project: ProjectSummary, design: OmniDesignDocument) => { closePanels(); setActiveProject(project); setActiveDesign(design) }
  // A project with exactly one design opens straight into its workspace; empty or multi-design projects
  // open the project page (composer plus design grid).
  const openProject = async (project: ProjectSummary) => {
    if (project.designCount === 1 && activeDesign?.projectId === project.id) return
    void window.omnidesign?.preview.hide()
    closePanels()
    const detail = await workspaceApi?.getProject(project.id)
    setActiveProject(detail?.project ?? project)
    setActiveDesign(detail && detail.designs.length === 1 ? detail.designs[0] : null)
  }
  const backFromDesign = () => {
    void window.omnidesign?.preview.hide()
    if (activeProject && activeProject.designCount > 1) { setActiveDesign(null); void refresh() }
    else home()
  }
  const cancelGeneration = async (jobId: string) => {
    await workspaceApi?.cancelGeneration(jobId)
    await refresh()
  }
  const removeGeneration = async (jobId: string) => {
    await workspaceApi?.removeGeneration(jobId)
    await refresh()
  }
  const resumeGenerationQueue = async (designId: string) => {
    await workspaceApi?.resumeGenerationQueue(designId)
    await refresh()
  }
  const changeNotifications = (enabled: boolean) => {
    setNotificationsEnabled(enabled)
    void window.omnidesign?.settings.saveNotificationsEnabled(enabled)
  }
  const changeGenerationDetail = (detail: 'full' | 'concise') => {
    setGenerationDetail(detail)
    void window.omnidesign?.settings.saveGenerationDetail(detail)
  }
  const reconnectProject = async (project: ProjectSummary) => {
    const folder = await workspaceApi?.chooseProjectFolder()
    if (!folder) return
    const next = await workspaceApi?.reconnectProject(project.id, folder)
    if (next) setActiveProject(next)
    await refresh()
  }
  const convertProjectToStandalone = async (project: ProjectSummary) => {
    const next = await workspaceApi?.convertProjectToStandalone(project.id)
    if (next) setActiveProject(next)
    await refresh()
  }
  const renameProject = async (project: ProjectSummary, name: string) => {
    const renamed = await workspaceApi?.renameProject(project.id, name)
    if (!renamed) throw new Error('The project could not be renamed.')
    setActiveProject(renamed)
    await refresh()
  }
  const renameDesign = async (design: OmniDesignDocument, title: string) => {
    const renamed = await workspaceApi?.renameDesign(design.id, title)
    if (!renamed) throw new Error('The design could not be renamed.')
    updateDesign(renamed)
    void refresh()
    return renamed
  }
  const restoreTrash = async (item: TrashItem) => { await workspaceApi?.restoreTrash(item.kind, item.id); await refresh() }
  const purgeTrash = async (item: TrashItem) => { await workspaceApi?.purgeTrash(item.kind, item.id); await refresh() }
  const emptyTrash = async (items: readonly TrashItem[]) => {
    for (const item of items) await workspaceApi?.purgeTrash(item.kind, item.id)
    await refresh()
  }
  const trashDesign = async (design: OmniDesignDocument) => {
    const result = await workspaceApi?.trash('design', design.id)
    if (!result || result.cancelled) return
    await window.omnidesign?.preview.hide()
    home()
  }
  const trashProject = async (project: ProjectSummary) => {
    const result = await workspaceApi?.trash('project', project.id)
    if (!result || result.cancelled) return
    home()
  }
  const associateDesign = async (design: OmniDesignDocument, projectId: string) => {
    const associated = await workspaceApi?.associateDesign(design.id, projectId)
    if (associated) { updateDesign(associated); setAssociationNotice({ designId: associated.id, projectId: associated.projectId, projectName: associated.projectName, mode: 'associated' }) }
    await refresh()
  }
  const associateAndRestart = async (design: OmniDesignDocument, projectId: string) => {
    const restarted = await workspaceApi?.associateAndRestart(design.id, projectId)
    if (restarted) updateDesign(restarted)
    setAssociationNotice(null)
    await refresh()
  }
  const activeGenerationCount = designs.flatMap((design) => design.generationJobs).filter((job) => job.state === 'running').length
  const diagnosticCount = collectDiagnostics(designs).length

  return (
    <div className="app-frame">
      <Sidebar projects={projects} activeProjectId={activeProject?.id ?? null} activeDesignId={activeDesign?.id ?? null} activeGenerationCount={activeGenerationCount} diagnosticCount={diagnosticCount} homeActive={!activeDesign && !activeProject && !settingsOpen && !providersOpen && !generationsOpen && !diagnosticsOpen && !trashOpen} settingsOpen={settingsOpen} providersOpen={providersOpen} generationsOpen={generationsOpen} diagnosticsOpen={diagnosticsOpen} trashOpen={trashOpen} onHome={home} onOpen={openProject} onOpenDesign={openProjectDesign} onAddDesign={startDesignInProject} onSettings={openSettings} onProviders={openProviders} onGenerations={openGenerations} onDiagnostics={openDiagnostics} onTrash={openTrash} />
      {generationsOpen
        ? <Generations designs={designs} onOpen={openDesign} onCancel={cancelGeneration} onRemove={removeGeneration} onResume={resumeGenerationQueue} />
        : diagnosticsOpen
        ? <Diagnostics designs={designs} onOpen={(design, revisionId) => void openDiagnostic(design, revisionId)} />
        : trashOpen
        ? <Trash items={trashItems} onRestore={restoreTrash} onPurge={purgeTrash} onEmpty={emptyTrash} />
        : providersOpen
        ? <Providers providers={providerState.providers} loading={providerState.loading} error={providerState.error} onRefresh={providerState.refresh} />
        : settingsOpen
        ? <Settings theme={theme} notificationsEnabled={notificationsEnabled} generationDetail={generationDetail} onThemeChange={changeTheme} onNotificationsChange={changeNotifications} onGenerationDetailChange={changeGenerationDetail} />
        : activeDesign
        ? <DesignWorkspace design={activeDesign} providers={providerState.providers} projects={projects} associationNotice={associationNotice?.designId === activeDesign.id ? associationNotice : null} activity={activitiesByDesign[activeDesign.id] ?? null} busy={activeDesign.generationJobs.some((job) => job.state === 'queued' || job.state === 'running')} detailLevel={generationDetail} onBack={backFromDesign} onChange={updateDesign} onRename={renameDesign} onTrash={trashDesign} onAssociate={associateDesign} onAssociateAndRestart={associateAndRestart} onDismissAssociation={() => setAssociationNotice(null)} onOpenProviders={openProviders} />
        : activeProject
        ? <ProjectPage project={activeProject} providers={providerState.providers} busy={creating} activity={null} onCreate={create} onOpenDesign={openDesign} onRenameProject={renameProject} onDesignRenamed={(renamed) => { updateDesign(renamed); void refresh() }} onReconnect={reconnectProject} onConvertToStandalone={convertProjectToStandalone} onTrashProject={trashProject} onOpenProviders={openProviders} />
        : <Home projects={projects} providers={providerState.providers} busy={creating} activity={null} composerProject={composerProject} onCreate={create} onOpen={openProject} onOpenProviders={openProviders} />}
    </div>
  )
}
