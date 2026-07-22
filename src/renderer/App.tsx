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
  FolderIcon,
  HomeIcon,
  PaperClipIcon,
  PlusIcon,
  SparklesIcon,
  StopIcon,
  TrashIcon,
  ViewColumnsIcon,
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftRightIcon,
  WindowIcon,
} from '@heroicons/react/24/outline'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ComponentType, KeyboardEvent, SVGProps } from 'react'
import { Button, Header, Input, Menu, MenuItem, MenuSection, Radio, RadioGroup, Slider, SliderThumb, SliderTrack, TextArea, TextField, Tooltip, TooltipTrigger } from 'react-aria-components'
import { DropdownButton } from './components/DropdownButton'

type Icon = ComponentType<SVGProps<SVGSVGElement>>

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

function Sidebar({ projects, activeProjectId, activeDesignId, activeGenerationCount, homeActive, settingsOpen, providersOpen, generationsOpen, trashOpen, onHome, onOpen, onOpenDesign, onAddDesign, onSettings, onProviders, onGenerations, onTrash }: {
  readonly projects: readonly ProjectSummary[]
  readonly activeProjectId: string | null
  readonly activeDesignId: string | null
  readonly activeGenerationCount: number
  readonly homeActive: boolean
  readonly settingsOpen: boolean
  readonly providersOpen: boolean
  readonly generationsOpen: boolean
  readonly trashOpen: boolean
  readonly onHome: () => void
  readonly onOpen: (project: ProjectSummary) => void
  readonly onOpenDesign: (project: ProjectSummary, design: OmniDesignDocument) => void
  readonly onAddDesign: (project: ProjectSummary) => void
  readonly onSettings: () => void
  readonly onProviders: () => void
  readonly onGenerations: () => void
  readonly onTrash: () => void
}) {
  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="brand-row">
        <span className="brand-mark" aria-hidden="true"><SparklesIcon /></span>
        <span className="brand-name">OmniDesign</span>
        <IconButton label="Notifications" icon={BellIcon} />
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
        <NavigationItem icon={TrashIcon} label="Trash" active={trashOpen} onPress={onTrash} />
        <NavigationItem icon={Cog6ToothIcon} label="Settings" active={settingsOpen} onPress={onSettings} />
        <div className="account-row"><span className="avatar">OD</span><span><strong>Local workspace</strong><small>Stored on this device</small></span></div>
      </div>
    </aside>
  )
}

function Generations({ designs, onOpen, onCancel }: {
  readonly designs: readonly OmniDesignDocument[]
  readonly onOpen: (design: OmniDesignDocument) => void
  readonly onCancel: (jobId: string) => Promise<void>
}) {
  const jobs = designs.flatMap((design) => design.generationJobs
    .filter((job) => ['queued', 'running'].includes(job.state))
    .map((job) => ({ design, job })))
  return (
    <main className="settings-main">
      <div className="settings-content">
        <header className="page-heading"><h1>Generations</h1><p>Work continues while you move between designs. Each design runs one prompt at a time.</p></header>
        <section className="settings-section" aria-labelledby="active-generations-heading">
          <div className="section-heading"><h2 id="active-generations-heading">Active work</h2><span>{jobs.length ? `${jobs.length} active` : 'All caught up'}</span></div>
          <div className="generation-list">
            {jobs.map(({ design, job }) => <article className="generation-row" key={job.id}>
              <Button className="generation-copy" onPress={() => onOpen(design)}><strong>{design.title}</strong><small>{design.queuePaused ? 'Queue paused' : job.state === 'queued' ? 'Queued' : design.generationSteps.at(-1)?.label ?? 'Running'} · {job.providerId === 'mock' ? 'Development provider' : `${job.providerId} · ${job.modelId}`} · {job.prompt}</small></Button>
              <time className="generation-elapsed" dateTime={job.startedAt ?? job.createdAt}>{formatGenerationElapsed(job.startedAt ?? job.createdAt)}</time>
              <Button className="secondary-action" onPress={() => void onCancel(job.id)}><StopIcon aria-hidden="true" />Stop</Button>
            </article>)}
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

// Interleave persisted user/assistant messages with the recorded generation milestones so the major
// steps of each run appear in the conversation history in the order they happened.
function buildConversationFeed(design: OmniDesignDocument): ConversationFeedItem[] {
  const items: ConversationFeedItem[] = [
    ...design.messages.map((message) => ({ kind: 'message' as const, createdAt: message.createdAt, message })),
    ...design.generationSteps.map((step) => ({ kind: 'step' as const, createdAt: step.createdAt, step })),
  ]
  return items.sort((first, second) => first.createdAt < second.createdAt ? -1 : first.createdAt > second.createdAt ? 1 : 0)
}

function formatGenerationElapsed(startedAt: string): string {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1_000))
  if (elapsedSeconds < 60) return `${elapsedSeconds}s`
  return `${Math.floor(elapsedSeconds / 60)}m ${elapsedSeconds % 60}s`
}

function Providers({ providers, loading, onRefresh }: {
  readonly providers: readonly ProviderStatus[]
  readonly loading: boolean
  readonly onRefresh: () => void
}) {
  return (
    <main className="settings-main">
      <div className="settings-content">
        <header className="page-heading"><h1>Providers</h1><p>OmniDesign uses the existing sign-in state of locally installed provider tools. No credentials are stored here.</p></header>
        <section className="settings-section" aria-labelledby="provider-availability-heading">
          <div className="section-heading"><h2 id="provider-availability-heading">Availability</h2><Button className="secondary-action" onPress={onRefresh} isDisabled={loading}><ArrowPathIcon className={loading ? 'spin' : undefined} aria-hidden="true" />Refresh</Button></div>
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

function Settings({ theme, onThemeChange }: { readonly theme: 'dark' | 'light'; readonly onThemeChange: (theme: 'dark' | 'light') => void }) {
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
      </div>
    </main>
  )
}

function Trash({ items, onRestore, onPurge }: { readonly items: readonly TrashItem[]; readonly onRestore: (item: TrashItem) => Promise<void>; readonly onPurge: (item: TrashItem) => Promise<void> }) {
  return (
    <main className="settings-main">
      <div className="settings-content">
        <header className="page-heading"><h1>Trash</h1><p>Deleted projects and designs are recoverable for 30 days. Linked source folders are never deleted.</p></header>
        <section className="settings-section" aria-labelledby="trash-heading">
          <div className="section-heading"><h2 id="trash-heading">Recently deleted</h2><span>{items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : 'Empty'}</span></div>
          <div className="generation-list">
            {items.map((item) => <article className="generation-row" key={`${item.kind}-${item.id}`}>
              <span className="generation-copy"><strong>{item.name}</strong><small>{item.kind === 'project' ? 'Project' : `Design in ${item.projectName ?? 'project'}`} · Purges {new Date(item.purgeAt).toLocaleDateString()}</small></span>
              <Button className="secondary-action" onPress={() => void onRestore(item)}>Restore</Button>
              <Button className="secondary-action" onPress={() => void onPurge(item)}>Delete permanently</Button>
            </article>)}
            {!items.length && <p className="settings-empty">No deleted projects or designs.</p>}
          </div>
        </section>
      </div>
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
  const provider = providerId === 'mock' ? undefined : available.find((candidate) => candidate.id === providerId)
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
      trigger={<><CommandLineIcon aria-hidden="true" /><span>{provider?.name ?? 'Development provider'} · {model?.name ?? 'Mock v1'}</span></>}
    >
        <div className="generation-settings-columns">
          <section className="generation-settings-column"><h2>Provider</h2><Menu aria-label="Provider" className="generation-settings-menu" shouldCloseOnSelect={false}>
            <MenuItem id="mock" onAction={() => selectProvider('mock')}><span>Development provider</span>{providerId === 'mock' && <CheckCircleIcon aria-hidden="true" />}</MenuItem>
            {available.map((candidate) => <MenuItem id={candidate.id} key={candidate.id} onAction={() => selectProvider(candidate.id)}><span>{candidate.name}</span>{providerId === candidate.id && <CheckCircleIcon aria-hidden="true" />}</MenuItem>)}
          </Menu></section>
          <section className="generation-settings-column"><h2>Model</h2><Menu aria-label="Model" className="generation-settings-menu" shouldCloseOnSelect={false}>
            {(provider?.models ?? []).map((candidate) => <MenuItem id={`model-${candidate.id}`} key={candidate.id} onAction={() => onChange({ providerId, modelId: candidate.id, effort: effortForModel(candidate.effortLevels) })}><span>{candidate.name}</span>{model?.id === candidate.id && <CheckCircleIcon aria-hidden="true" />}</MenuItem>)}
            {!provider && <MenuItem id="mock-model" isDisabled>Mock v1</MenuItem>}
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

function NewDesignComposer({ providers, busy, fixedProject, projects = [], initialProject = null, onCreate }: {
  readonly providers: readonly ProviderStatus[]
  readonly busy: boolean
  readonly fixedProject?: ProjectSummary
  readonly projects?: readonly ProjectSummary[]
  readonly initialProject?: ProjectSummary | null
  readonly onCreate: (prompt: string, providerId: ProviderId, modelId: string, effort: string | null, target: CreateDesignTarget | null) => Promise<void>
}) {
  const [prompt, setPrompt] = useState('')
  const readyProviders = providers.filter((provider) => provider.installed && provider.authenticated && provider.models.length)
  const [selection, setSelection] = useState<GenerationSelection>({ providerId: 'mock', modelId: 'mock-v1', effort: null })
  const [sourceProjectPath, setSourceProjectPath] = useState<string | null>(null)
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(initialProject)
  // Only linked (folder-backed) projects are meaningful reuse targets; standalone projects stay the
  // private container of their single design.
  const linkedProjects = projects.filter((project) => project.kind === 'linked')
  useEffect(() => {
    const pending = window.omnidesign?.settings.getGenerationDefaults?.()
    if (!pending) return
    void pending.then((saved) => { if (saved) setSelection(saved) })
  }, [])
  // Pre-fill the target when a project's "+" launched this composer.
  useEffect(() => {
    if (!initialProject) return
    setSelectedProject(initialProject)
    setSourceProjectPath(null)
  }, [initialProject])
  const applySelection = (next: GenerationSelection) => {
    setSelection(next)
    void window.omnidesign?.settings.saveGenerationDefaults?.(next)
  }
  const target = (): CreateDesignTarget | null => {
    if (fixedProject) return { projectId: fixedProject.id }
    if (selectedProject) return { projectId: selectedProject.id }
    return sourceProjectPath ? { sourceProjectPath } : null
  }
  const projectLabel = selectedProject ? selectedProject.name : sourceProjectPath ? sourceProjectPath.split(/[\\/]/).filter(Boolean).at(-1) : 'Standalone design'
  const chooseTarget = (key: string) => {
    if (key === 'standalone') { setSelectedProject(null); setSourceProjectPath(null); return }
    if (key === 'folder') { setSelectedProject(null); void window.omnidesign?.workspace.chooseProjectFolder().then((path) => { if (path) { setSourceProjectPath(path); setSelectedProject(null) } }); return }
    if (key.startsWith('project:')) {
      const project = projects.find((candidate) => candidate.id === key.slice('project:'.length))
      if (project) { setSelectedProject(project); setSourceProjectPath(null) }
    }
  }
  const submit = async () => {
    const value = prompt.trim()
    if (!value || busy) return
    await onCreate(value, selection.providerId, selection.modelId, selection.effort, target())
    setPrompt('')
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && prompt.trim()) {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <section className="new-design-composer" aria-label="Create a design">
      <TextField className="prompt-field" aria-label="What would you like to design?">
        <TextArea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={onKeyDown} placeholder="What would you like to design?" />
      </TextField>
      <div className="composer-footer">
        <div className="composer-leading">
          <IconButton label="Attach files or folders" icon={PaperClipIcon} />
          {fixedProject
            ? <span className="project-context project-context-fixed">{fixedProject.kind === 'linked' ? <FolderIcon aria-hidden="true" /> : <DocumentDuplicateIcon aria-hidden="true" />}{fixedProject.name}</span>
            : <DropdownButton triggerClassName="project-context" popoverClassName="project-popover" placement="top" trigger={<><FolderIcon aria-hidden="true" />{projectLabel}</>}>
                <Menu aria-label="Design project" onAction={(key) => chooseTarget(String(key))}>
                  <MenuItem id="standalone">Standalone design</MenuItem>
                  <MenuItem id="folder">Choose local project folder…</MenuItem>
                  {linkedProjects.length > 0 && <MenuSection className="project-popover-section">
                    <Header className="project-popover-header">Add to a project</Header>
                    {linkedProjects.map((project) => <MenuItem id={`project:${project.id}`} key={project.id}>{project.name}</MenuItem>)}
                  </MenuSection>}
                </Menu>
              </DropdownButton>}
        </div>
        <GenerationSettingsMenu providers={readyProviders} providerId={selection.providerId} modelId={selection.modelId} effort={selection.effort} onChange={applySelection} />
        <Button className="submit-prompt" aria-label="Create design" isDisabled={!prompt.trim() || busy} onPress={() => void submit()}>
          {busy ? <ArrowPathIcon className="spin" aria-hidden="true" /> : <ArrowRightIcon aria-hidden="true" />}
        </Button>
      </div>
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

function CloneProjectForm({ onClone }: { readonly onClone: (remoteUrl: string, destinationPath: string) => Promise<void> }) {
  const [remoteUrl, setRemoteUrl] = useState('')
  const [destinationPath, setDestinationPath] = useState('')
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  useEffect(() => window.omnidesign?.workspace.onCloneActivity((detail) => setProgress(detail)), [])
  const chooseDestination = async () => {
    const directory = await window.omnidesign?.workspace.chooseProjectFolder()
    if (directory) setDestinationPath(directory)
  }
  const submit = async () => {
    if (!remoteUrl.trim() || !destinationPath || running) return
    setRunning(true); setError(null); setProgress('Preparing clone…')
    try { await onClone(remoteUrl.trim(), destinationPath) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Git clone failed.') }
    finally { setRunning(false) }
  }
  return <section className="settings-section" aria-labelledby="clone-project-heading">
    <div className="section-heading"><h2 id="clone-project-heading">Clone a Git repository</h2><span>Uses your installed Git credentials</span></div>
    <TextField aria-label="Remote Git URL"><Input value={remoteUrl} onChange={(event) => setRemoteUrl(event.target.value)} placeholder="git@github.com:team/project.git" /></TextField>
    <div className="clone-destination"><TextField aria-label="Clone destination"><Input value={destinationPath} onChange={(event) => setDestinationPath(event.target.value)} placeholder="Choose an empty destination folder" /></TextField><Button className="secondary-action" onPress={() => void chooseDestination()}>Choose folder</Button></div>
    <Button className="secondary-action" isDisabled={!remoteUrl.trim() || !destinationPath || running} onPress={() => void submit()}>{running ? 'Cloning…' : 'Clone and open project'}</Button>
    {progress && <p className="settings-empty" role="status">{progress}</p>}
    {error && <p className="generation-recovery" role="alert">{error}</p>}
  </section>
}

function Home({ projects, providers, busy, activity, composerProject, onCreate, onOpen, onClone }: {
  readonly projects: readonly ProjectSummary[]
  readonly providers: readonly ProviderStatus[]
  readonly busy: boolean
  readonly activity: GenerationActivity | null
  readonly composerProject: ProjectSummary | null
  readonly onCreate: (prompt: string, providerId: ProviderId, modelId: string, effort: string | null, target: CreateDesignTarget | null) => Promise<void>
  readonly onOpen: (project: ProjectSummary) => void
  readonly onClone: (remoteUrl: string, destinationPath: string) => Promise<void>
}) {
  return (
    <main className="home-main">
      <div className="home-content">
        <header className="page-heading"><h1>Start with an idea.</h1><p>Turn it into something you can see, use, and refine—without leaving your local workspace.</p></header>
        <NewDesignComposer providers={providers} busy={busy} projects={projects} initialProject={composerProject} onCreate={onCreate} />
        <CloneProjectForm onClone={onClone} />
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
            {!projects.length && <div className="empty-designs"><DocumentDuplicateIcon aria-hidden="true" /><strong>Your first design starts above</strong><p>The development provider will generate, compile, validate, and save it locally.</p></div>}
          </div>
        </section>
      </div>
    </main>
  )
}

function ProjectPage({ project, providers, busy, activity, onCreate, onOpenDesign, onReconnect, onConvertToStandalone, onTrashProject }: {
  readonly project: ProjectSummary
  readonly providers: readonly ProviderStatus[]
  readonly busy: boolean
  readonly activity: GenerationActivity | null
  readonly onCreate: (prompt: string, providerId: ProviderId, modelId: string, effort: string | null, target: CreateDesignTarget | null) => Promise<void>
  readonly onOpenDesign: (design: OmniDesignDocument) => void
  readonly onReconnect: (project: ProjectSummary) => Promise<void>
  readonly onConvertToStandalone: (project: ProjectSummary) => Promise<void>
  readonly onTrashProject: (project: ProjectSummary) => Promise<void>
}) {
  const [designs, setDesigns] = useState<readonly OmniDesignDocument[]>([])
  const load = useCallback(async () => {
    const detail = await window.omnidesign?.workspace.getProject(project.id)
    if (detail) setDesigns(detail.designs)
  }, [project.id])
  useEffect(() => { void load() }, [load])

  return (
    <main className="home-main">
      <div className="home-content">
        <header className="page-heading">
          <h1>{project.name}</h1>
          <p>{project.kind === 'linked' ? (project.sourceAvailable ? project.sourceProjectPath ?? 'Linked project' : 'Linked source folder is unavailable') : 'Standalone project'}</p>
          {project.kind === 'linked' && !project.sourceAvailable && <div className="generation-recovery" role="status"><span><strong>Source folder unavailable.</strong> Your saved designs are safe; reconnect the folder or keep this project standalone.</span><Button className="secondary-action" onPress={() => void onReconnect(project)}>Reconnect folder</Button><Button className="secondary-action" onPress={() => void onConvertToStandalone(project)}>Convert to standalone</Button></div>}
          <Button className="secondary-action" onPress={() => void onTrashProject(project)}><TrashIcon aria-hidden="true" />Remove project</Button>
        </header>
        <NewDesignComposer providers={providers} busy={busy} fixedProject={project} onCreate={onCreate} />
        {busy && <div className="generation-notice" role="status"><ArrowPathIcon className="spin" aria-hidden="true" /><span><strong>{activity?.detail ?? 'Setting up design repository…'}</strong></span></div>}
        <section className="recent-section" aria-labelledby="project-designs">
          <div className="section-heading"><h2 id="project-designs">Designs</h2><span>{designs.length ? `${designs.length} design${designs.length === 1 ? '' : 's'}` : 'No designs yet'}</span></div>
          {designs.length
            ? <div className="design-grid" role="group" aria-label="Designs in this project">
                {designs.map((design) => {
                  const activeJob = [...design.generationJobs].reverse().find((job) => ['queued', 'running'].includes(job.state))
                  const status = design.queuePaused ? 'Queue paused' : activeJob ? (activeJob.state === 'queued' ? 'Queued' : 'Generating') : 'Saved locally'
                  return (
                    <Button className="design-card" key={design.id} onPress={() => onOpenDesign(design)}>
                      <span className="design-card-thumb"><ProjectThumbnail title={design.title} thumbnailDataUrl={design.thumbnailDataUrl} /></span>
                      <span className="design-card-body">
                        <strong>{design.title}</strong>
                        <small>{design.revisions.at(-1)?.prompt ?? design.messages.find((message) => message.role === 'user')?.text ?? 'Ready for a first direction'}</small>
                        <span className="design-card-meta"><span>{new Date(design.updatedAt).toLocaleDateString()}</span><span>{design.lastSelection.providerId === 'mock' ? 'Development provider' : `${design.lastSelection.providerId} · ${design.lastSelection.modelId}`}</span></span>
                        <span className="design-card-status" data-busy={Boolean(activeJob) || undefined}>{status}</span>
                      </span>
                    </Button>
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

function LayoutMenu({ mode, onOpenChange, onChange }: { readonly mode: LayoutMode; readonly onOpenChange: (open: boolean) => void; readonly onChange: (mode: LayoutMode) => void }) {
  const current = layoutModes.find((candidate) => candidate.id === mode) ?? layoutModes[0]
  const CurrentIcon = current.icon
  return (
    <DropdownButton
      label={`Layout: ${current.label}`}
      triggerClassName="toolbar-button"
      popoverClassName="project-popover layout-menu"
      placement="bottom"
      onOpenChange={onOpenChange}
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

function DesignWorkspace({ design, providers, projects, associatedProjectName, activity, busy, onBack, onChange, onTrash, onAssociate, onDismissAssociation }: {
  readonly design: OmniDesignDocument
  readonly providers: readonly ProviderStatus[]
  readonly projects: readonly ProjectSummary[]
  readonly associatedProjectName: string | null
  readonly activity: GenerationActivity | null
  readonly busy: boolean
  readonly onBack: () => void
  readonly onChange: (design: OmniDesignDocument) => void
  readonly onTrash: (design: OmniDesignDocument) => Promise<void>
  readonly onAssociate: (design: OmniDesignDocument, projectId: string) => Promise<void>
  readonly onDismissAssociation: () => void
}) {
  const [draft, setDraft] = useState(design.draft)
  const [attachments, setAttachments] = useState<readonly DesignAttachment[]>(design.draftAttachments)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false)
  const [freezeFrame, setFreezeFrame] = useState<string | null>(null)
  const [conversationWidth, setConversationWidth] = useState(design.layout.conversationWidth)
  const [mode, setMode] = useState<LayoutMode>(design.layout.mode)
  const [selection, setSelection] = useState<GenerationSelection>(design.lastSelection)
  const split = useRef<HTMLDivElement>(null)
  const selectedIsHead = design.selectedRevisionId === design.activeRevisionId
  const selectedRevision = design.revisions.find((revision) => revision.id === design.selectedRevisionId)
  const latestInvalidCandidate = design.invalidCandidates.at(-1)
  const activeJob = [...design.generationJobs].reverse().find((job) => ['queued', 'running'].includes(job.state))
  const retryableJob = [...design.generationJobs].reverse().find((job) => ['failed', 'cancelled', 'interrupted'].includes(job.state))
  const api = window.omnidesign?.workspace
  const readyProviders = providers.filter((provider) => provider.installed && provider.authenticated && provider.models.length)

  // The isolated preview is a native layer painted above the DOM. While a header overlay sits over the
  // docked preview, capture its current frame, show that still image on the preview surface, then hide
  // the native layer so the overlay paints cleanly over the frozen frame — with no visible gap.
  const overlayCoversPreview = historyOpen || layoutMenuOpen
  useEffect(() => {
    const preview = window.omnidesign?.preview
    if (!preview) return
    if (!overlayCoversPreview) {
      void preview.setSuspended(false)
      setFreezeFrame(null)
      return
    }
    let cancelled = false
    void preview.freeze().then((frame) => {
      if (cancelled) return
      setFreezeFrame(frame)
      requestAnimationFrame(() => { if (!cancelled) void preview.setSuspended(true) })
    })
    return () => { cancelled = true }
  }, [overlayCoversPreview])
  useEffect(() => setDraft(design.draft), [design.id, design.draft])
  useEffect(() => setAttachments(design.draftAttachments), [design.id, design.draftAttachments])
  useEffect(() => setConversationWidth(design.layout.conversationWidth), [design.id, design.layout.conversationWidth])
  useEffect(() => setMode(design.layout.mode), [design.id, design.layout.mode])
  useEffect(() => setSelection(design.lastSelection), [design.id])
  const applySelection = (next: GenerationSelection) => {
    setSelection(next)
    void window.omnidesign?.workspace.saveSelection?.(design.id, next)
  }
  useEffect(() => {
    if (!api) return
    const timer = window.setTimeout(() => { void api.saveDraft(design.id, draft, attachments) }, 300)
    return () => window.clearTimeout(timer)
  }, [api, design.id, draft, attachments])
  useEffect(() => {
    if (!api) return
    const timer = window.setTimeout(() => { void api.saveLayout(design.id, { conversationWidth, mode }) }, 250)
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
    if (!api || !draft.trim() || busy || !selectedIsHead) return
    onChange(await api.generate(design.id, draft.trim(), selection.providerId, selection.modelId, selection.effort ?? undefined, attachments))
    setDraft('')
    setAttachments([])
  }
  const selectRevision = async (revisionId: string) => {
    if (!api || revisionId === design.selectedRevisionId) return
    onChange(await api.selectRevision(design.id, revisionId))
  }
  const restore = async () => {
    if (!api || !design.selectedRevisionId) return
    onChange(await api.restoreRevision(design.id, design.selectedRevisionId))
  }
  const exportRevision = async () => {
    if (api && design.selectedRevisionId) await api.exportRevision(design.id, design.selectedRevisionId)
  }
  const cancelGeneration = async () => {
    if (!api || !activeJob) return
    await api.cancelGeneration(activeJob.id)
    const updated = await api.get(design.id)
    if (updated) onChange(updated)
  }
  const retryGeneration = async () => {
    if (!api || !retryableJob) return
    await api.retryGeneration(retryableJob.id)
    const updated = await api.get(design.id)
    if (updated) onChange(updated)
  }
  const continueGeneration = async () => {
    if (!api || !retryableJob) return
    await api.continueGeneration(retryableJob.id)
    const updated = await api.get(design.id)
    if (updated) onChange(updated)
  }
  const chooseAttachments = async () => {
    const selected = await api?.chooseAttachments()
    if (selected?.length) setAttachments((current) => [...current, ...selected.filter((attachment) => !current.some((existing) => existing.path === attachment.path))])
  }
  const adaptToAssociatedProject = async () => {
    if (!api || !associatedProjectName || busy) return
    onChange(await api.generate(design.id, `Adapt this design to the established design language of ${associatedProjectName}. Preserve its purpose while aligning visual language, interaction patterns, and relevant project conventions.`, selection.providerId, selection.modelId, selection.effort ?? undefined, attachments))
    onDismissAssociation()
  }

  const previewStatus = selectedRevision
    ? selectedRevision.diagnostics.length ? `${selectedRevision.diagnostics.length} diagnostic${selectedRevision.diagnostics.length === 1 ? '' : 's'} captured` : 'Offline · validated'
    : 'Waiting for revision'

  const conversationPane = (
    <section className="conversation-pane" aria-label="Design conversation">
      <div className="conversation-feed">
        {buildConversationFeed(design).map((item) => item.kind === 'message'
          ? <article className={`conversation-message message-${item.message.role}`} key={item.message.id}><span>{item.message.role === 'user' ? 'You' : 'OmniDesign'}</span><p>{item.message.text}</p></article>
          : <div className={`conversation-step step-${item.step.stage}`} key={item.step.id}><span className="conversation-step-label">{item.step.label}</span>{item.step.detail && <span className="conversation-step-detail">{item.step.detail}</span>}</div>)}
        {activity && busy && <div className="generation-progress" role="status"><ArrowPathIcon className="spin" aria-hidden="true" /><span><strong>{activity.stage}</strong>{activity.detail}</span>{activeJob && <Button className="secondary-action" onPress={() => void cancelGeneration()}><StopIcon aria-hidden="true" />Stop</Button>}</div>}
        {!activeJob && retryableJob && <div className="generation-recovery" role="status"><span><strong>{retryableJob.state}</strong>{retryableJob.error ?? 'Generation needs attention.'}</span><Button className="secondary-action" onPress={() => void continueGeneration()}>Continue</Button><Button className="secondary-action" onPress={() => void retryGeneration()}><ArrowPathIcon aria-hidden="true" />Retry</Button></div>}
        {latestInvalidCandidate && <section className="invalid-candidate-notice" role="alert">
          <strong>Latest candidate was not activated</strong>
          <p>{latestInvalidCandidate.diagnostic}</p>
          <details><summary>Technical details</summary><pre>{latestInvalidCandidate.html}</pre></details>
        </section>}
        {associatedProjectName && <div className="generation-recovery" role="status"><span><strong>Design associated with {associatedProjectName}.</strong>Optionally adapt this design to the linked project's design language in a new revision.</span><Button className="secondary-action" onPress={() => void adaptToAssociatedProject()}>Adapt design</Button><Button className="secondary-action" onPress={onDismissAssociation}>Keep current design</Button></div>}
      </div>
      {!selectedIsHead && <div className="historical-banner"><ClockIcon aria-hidden="true" /><span><strong>Viewing an earlier revision</strong>Restore it as a new head before prompting.</span><Button className="secondary-action" onPress={() => void restore()}>Restore revision</Button></div>}
      <div className="workspace-composer">
        <TextField aria-label="Request a design change"><TextArea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Describe the next change…" disabled={!selectedIsHead} onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() }
        }} /></TextField>
        {attachments.length > 0 && <div className="attachment-list" aria-label="Attached references">{attachments.map((attachment) => <span className="attachment-chip" data-status={attachment.status} key={attachment.id}>{attachment.name}{attachment.status !== 'available' && ` (${attachment.status})`}<Button aria-label={`Remove ${attachment.name}`} onPress={() => setAttachments((current) => current.filter((candidate) => candidate.id !== attachment.id))}>×</Button></span>)}</div>}
        <div className="workspace-composer-footer"><Button className="toolbar-button" aria-label="Attach files or folders" onPress={() => void chooseAttachments()}><PaperClipIcon aria-hidden="true" /></Button><GenerationSettingsMenu providers={readyProviders} providerId={selection.providerId} modelId={selection.modelId} effort={selection.effort} onChange={applySelection} /><Button className="submit-prompt" aria-label="Send change" isDisabled={!draft.trim() || busy || !selectedIsHead} onPress={() => void submit()}><ArrowRightIcon aria-hidden="true" /></Button></div>
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
    <main className="workspace-main">
      <header className="workspace-toolbar">
        <IconButton label="Back" icon={ArrowLeftIcon} onPress={onBack} />
        <span className="workspace-title"><strong>{design.title}</strong><small>{busy ? activity?.stage ?? 'Working' : 'Saved locally'}</small></span>
        <div className="toolbar-actions">
          <LayoutMenu mode={mode} onOpenChange={setLayoutMenuOpen} onChange={setMode} />
          <DropdownButton
            triggerClassName="toolbar-button"
            popoverClassName="history-popover"
            placement="bottom"
            onOpenChange={setHistoryOpen}
            trigger={<><ClockIcon aria-hidden="true" />History · {design.revisions.length}</>}
          >
            <Menu aria-label="Revision history" onAction={(key) => void selectRevision(String(key))}>
              {[...design.revisions].reverse().map((revision, index) => (
                <MenuItem id={revision.id} key={revision.id} textValue={revision.prompt} className={revision.id === design.selectedRevisionId ? 'history-row history-row-active' : 'history-row'}>
                  {revision.thumbnailDataUrl
                    ? <img alt={`Preview of revision ${index === 0 ? 'current head' : index + 1}`} className="history-thumbnail" src={revision.thumbnailDataUrl} />
                    : <span className="history-thumbnail history-thumbnail-placeholder" aria-hidden="true" />}
                  <span><strong>{index === 0 ? 'Current head' : new Date(revision.createdAt).toLocaleString()}</strong><small>{revision.prompt}</small></span>
                </MenuItem>
              ))}
            </Menu>
          </DropdownButton>
          {projects.some((project) => project.kind === 'linked' && project.id !== design.projectId) && <DropdownButton triggerClassName="toolbar-button" popoverClassName="project-popover" placement="bottom" trigger={<><FolderIcon aria-hidden="true" />Associate</>}>
            <Menu aria-label="Associate design with project" onAction={(key) => void onAssociate(design, String(key))}>
              {projects.filter((project) => project.kind === 'linked' && project.id !== design.projectId).map((project) => <MenuItem id={project.id} key={project.id}>{project.name}</MenuItem>)}
            </Menu>
          </DropdownButton>}
          <Button className="toolbar-button" onPress={() => void exportRevision()} isDisabled={!design.selectedRevisionId}><ArrowDownTrayIcon aria-hidden="true" />Export</Button>
          <Button className="toolbar-button" onPress={() => void onTrash(design)}><TrashIcon aria-hidden="true" />Remove</Button>
        </div>
      </header>
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
  )
}

function useProviders(): { readonly label: string; readonly providers: readonly ProviderStatus[]; readonly loading: boolean; readonly refresh: () => void } {
  const [label, setLabel] = useState('Development provider')
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [loading, setLoading] = useState(false)
  const refresh = useCallback(() => {
    const api = window.omnidesign?.providers
    if (!api) return
    setLoading(true)
    void api.discover().then((available) => {
      setProviders(available)
      const provider = available.find((candidate) => candidate.installed && candidate.authenticated)
      setLabel(provider ? `${provider.name} available · Development provider active` : 'Development provider')
    }).catch(() => {
      setProviders([])
      setLabel('Development provider')
    }).finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    refresh()
  }, [refresh])
  return { label, providers, loading, refresh }
}

export function App() {
  const [designs, setDesigns] = useState<OmniDesignDocument[]>([])
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [trashItems, setTrashItems] = useState<TrashItem[]>([])
  const [activeDesign, setActiveDesign] = useState<OmniDesignDocument | null>(null)
  const [activeProject, setActiveProject] = useState<ProjectSummary | null>(null)
  const [composerProject, setComposerProject] = useState<ProjectSummary | null>(null)
  const [associationNotice, setAssociationNotice] = useState<{ readonly designId: string; readonly projectName: string } | null>(null)
  const [activity, setActivity] = useState<GenerationActivity | null>(null)
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [providersOpen, setProvidersOpen] = useState(false)
  const [generationsOpen, setGenerationsOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const providerState = useProviders()
  const workspaceApi = window.omnidesign?.workspace

  const updateDesign = useCallback((design: OmniDesignDocument) => {
    setActiveDesign(design)
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
  }, [])
  useEffect(() => {
    if (!workspaceApi) return
    return workspaceApi.onActivity((next) => {
      setActivity(next)
      const finished = ['complete', 'failed', 'cancelled', 'interrupted'].includes(next.stage)
      setBusy(!finished)
      if (finished) {
        void workspaceApi.get(next.designId).then((design) => {
          if (design) updateDesign(design)
        })
        void refresh()
      }
    })
  }, [refresh, updateDesign, workspaceApi])
  useEffect(() => window.omnidesign?.preview.onDiagnostic((event) => {
    if (event.designId !== activeDesign?.id || !workspaceApi) return
    void workspaceApi.get(event.designId).then((design) => { if (design) updateDesign(design) })
  }), [activeDesign?.id, updateDesign, workspaceApi])
  useEffect(() => window.omnidesign?.preview.onThumbnail((event) => {
    void refresh()
    if (event.designId !== activeDesign?.id || !workspaceApi) return
    void workspaceApi.get(event.designId).then((design) => { if (design) updateDesign(design) })
  }), [activeDesign?.id, refresh, updateDesign, workspaceApi])

  const create = async (prompt: string, providerId: ProviderId, modelId: string, effort: string | null, target: CreateDesignTarget | null) => {
    if (!workspaceApi) return
    setCreating(true)
    try {
      const design = await workspaceApi.create(prompt, providerId, modelId, effort ?? undefined, target)
      setActiveDesign(design)
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
  const closePanels = () => { setGenerationsOpen(false); setProvidersOpen(false); setSettingsOpen(false); setTrashOpen(false) }
  const home = () => { void window.omnidesign?.preview.hide(); closePanels(); setActiveDesign(null); setActiveProject(null); setComposerProject(null); setActivity(null); void refresh() }
  // The "+" on a sidebar project row jumps home with that project pre-filled in the composer target.
  const startDesignInProject = (project: ProjectSummary) => { void window.omnidesign?.preview.hide(); closePanels(); setActiveDesign(null); setActiveProject(null); setComposerProject(project) }
  const openSettings = () => { void window.omnidesign?.preview.hide(); closePanels(); setActiveDesign(null); setActiveProject(null); setSettingsOpen(true) }
  const openProviders = () => { void window.omnidesign?.preview.hide(); closePanels(); setActiveDesign(null); setActiveProject(null); setProvidersOpen(true); providerState.refresh() }
  const openGenerations = () => { void window.omnidesign?.preview.hide(); closePanels(); setActiveDesign(null); setActiveProject(null); setGenerationsOpen(true); void refresh() }
  const openTrash = () => { void window.omnidesign?.preview.hide(); closePanels(); setActiveDesign(null); setActiveProject(null); setTrashOpen(true); void refresh() }
  const openDesign = (design: OmniDesignDocument) => { closePanels(); setActiveDesign(design) }
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
  const cloneProject = async (remoteUrl: string, destinationPath: string) => {
    if (!workspaceApi) return
    const project = await workspaceApi.cloneProject(remoteUrl, destinationPath)
    await refresh()
    setActiveProject(project)
    setActiveDesign(null)
    setComposerProject(null)
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
  const restoreTrash = async (item: TrashItem) => { await workspaceApi?.restoreTrash(item.kind, item.id); await refresh() }
  const purgeTrash = async (item: TrashItem) => { await workspaceApi?.purgeTrash(item.kind, item.id); await refresh() }
  const trashDesign = async (design: OmniDesignDocument) => { await workspaceApi?.trash('design', design.id); home() }
  const trashProject = async (project: ProjectSummary) => { await workspaceApi?.trash('project', project.id); home() }
  const associateDesign = async (design: OmniDesignDocument, projectId: string) => {
    const associated = await workspaceApi?.associateDesign(design.id, projectId)
    if (associated) { updateDesign(associated); setAssociationNotice({ designId: associated.id, projectName: associated.projectName }) }
    await refresh()
  }
  const activeGenerationCount = designs.flatMap((design) => design.generationJobs).filter((job) => ['queued', 'running'].includes(job.state)).length

  return (
    <div className="app-frame">
      <Sidebar projects={projects} activeProjectId={activeProject?.id ?? null} activeDesignId={activeDesign?.id ?? null} activeGenerationCount={activeGenerationCount} homeActive={!activeDesign && !activeProject && !settingsOpen && !providersOpen && !generationsOpen && !trashOpen} settingsOpen={settingsOpen} providersOpen={providersOpen} generationsOpen={generationsOpen} trashOpen={trashOpen} onHome={home} onOpen={openProject} onOpenDesign={openProjectDesign} onAddDesign={startDesignInProject} onSettings={openSettings} onProviders={openProviders} onGenerations={openGenerations} onTrash={openTrash} />
      {generationsOpen
        ? <Generations designs={designs} onOpen={openDesign} onCancel={cancelGeneration} />
        : trashOpen
        ? <Trash items={trashItems} onRestore={restoreTrash} onPurge={purgeTrash} />
        : providersOpen
        ? <Providers providers={providerState.providers} loading={providerState.loading} onRefresh={providerState.refresh} />
        : settingsOpen
        ? <Settings theme={theme} onThemeChange={changeTheme} />
        : activeDesign
        ? <DesignWorkspace design={activeDesign} providers={providerState.providers} projects={projects} associatedProjectName={associationNotice?.designId === activeDesign.id ? associationNotice.projectName : null} activity={activity?.designId === activeDesign.id ? activity : null} busy={busy && activity?.designId === activeDesign.id} onBack={backFromDesign} onChange={updateDesign} onTrash={trashDesign} onAssociate={associateDesign} onDismissAssociation={() => setAssociationNotice(null)} />
        : activeProject
        ? <ProjectPage project={activeProject} providers={providerState.providers} busy={creating} activity={creating ? activity : null} onCreate={create} onOpenDesign={openDesign} onReconnect={reconnectProject} onConvertToStandalone={convertProjectToStandalone} onTrashProject={trashProject} />
        : <Home projects={projects} providers={providerState.providers} busy={creating} activity={creating ? activity : null} composerProject={composerProject} onCreate={create} onOpen={openProject} onClone={cloneProject} />}
    </div>
  )
}
