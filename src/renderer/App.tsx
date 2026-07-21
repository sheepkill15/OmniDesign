import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  BellIcon,
  BoltIcon,
  CheckCircleIcon,
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
} from '@heroicons/react/24/outline'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ComponentType, KeyboardEvent, SVGProps } from 'react'
import { Button, Radio, RadioGroup, TextArea, TextField, Tooltip, TooltipTrigger } from 'react-aria-components'

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

function Sidebar({ designs, activeDesignId, settingsOpen, providersOpen, generationsOpen, onHome, onOpen, onSettings, onProviders, onGenerations }: {
  readonly designs: readonly OmniDesignDocument[]
  readonly activeDesignId: string | null
  readonly settingsOpen: boolean
  readonly providersOpen: boolean
  readonly generationsOpen: boolean
  readonly onHome: () => void
  readonly onOpen: (design: OmniDesignDocument) => void
  readonly onSettings: () => void
  readonly onProviders: () => void
  readonly onGenerations: () => void
}) {
  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="brand-row">
        <span className="brand-mark" aria-hidden="true"><SparklesIcon /></span>
        <span className="brand-name">OmniDesign</span>
        <IconButton label="Notifications" icon={BellIcon} />
      </div>
      <nav className="global-navigation" aria-label="Application">
        <NavigationItem icon={HomeIcon} label="Home" active={!activeDesignId && !settingsOpen} onPress={onHome} />
        <NavigationItem icon={BoltIcon} label="Generations" badge={(() => { const count = designs.flatMap((design) => design.generationJobs).filter((job) => ['queued', 'running'].includes(job.state)).length; return count ? String(count) : undefined })()} active={generationsOpen} onPress={onGenerations} />
      </nav>
      <div className="sidebar-section">
        <div className="sidebar-heading"><span>Designs</span><IconButton label="Add design" icon={PlusIcon} onPress={onHome} /></div>
        <div className="project-navigation">
          {designs.map((design) => (
            <Button className="project-row" data-active={design.id === activeDesignId || undefined} key={design.id} onPress={() => onOpen(design)}>
              <FolderIcon aria-hidden="true" />
              <span>{design.title}</span>
              <span>{design.revisions.length}</span>
            </Button>
          ))}
          {!designs.length && <p className="sidebar-empty">Your local designs will appear here.</p>}
        </div>
      </div>
      <div className="sidebar-footer">
        <NavigationItem icon={CommandLineIcon} label="Providers" active={providersOpen} onPress={onProviders} />
        <NavigationItem icon={TrashIcon} label="Trash" />
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
              <Button className="generation-copy" onPress={() => onOpen(design)}><strong>{design.title}</strong><small>{design.queuePaused ? 'Queue paused' : job.state === 'queued' ? 'Queued' : 'Running'} · {job.prompt}</small></Button>
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

function NewDesignComposer({ providerLabel, busy, onCreate }: {
  readonly providerLabel: string
  readonly busy: boolean
  readonly onCreate: (prompt: string) => Promise<void>
}) {
  const [prompt, setPrompt] = useState('')
  const submit = async () => {
    const value = prompt.trim()
    if (!value || busy) return
    await onCreate(value)
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
        <div className="composer-leading"><IconButton label="Attach files or folders" icon={PaperClipIcon} /><span className="project-context"><FolderIcon aria-hidden="true" />Standalone design</span></div>
        <div className="composer-controls"><span className="control-button"><SparklesIcon aria-hidden="true" />{providerLabel}</span><span className="control-button"><CommandLineIcon aria-hidden="true" />Mock model</span></div>
        <Button className="submit-prompt" aria-label="Create design" isDisabled={!prompt.trim() || busy} onPress={() => void submit()}>
          {busy ? <ArrowPathIcon className="spin" aria-hidden="true" /> : <ArrowRightIcon aria-hidden="true" />}
        </Button>
      </div>
    </section>
  )
}

function Home({ designs, providerLabel, busy, activity, onCreate, onOpen }: {
  readonly designs: readonly OmniDesignDocument[]
  readonly providerLabel: string
  readonly busy: boolean
  readonly activity: GenerationActivity | null
  readonly onCreate: (prompt: string) => Promise<void>
  readonly onOpen: (design: OmniDesignDocument) => void
}) {
  return (
    <main className="home-main">
      <div className="home-content">
        <header className="page-heading"><h1>Start with an idea.</h1><p>Turn it into something you can see, use, and refine—without leaving your local workspace.</p></header>
        <NewDesignComposer providerLabel={providerLabel} busy={busy} onCreate={onCreate} />
        {activity && <div className="generation-notice" role="status"><BoltIcon aria-hidden="true" /><span><strong>{activity.stage}</strong>{activity.detail}</span></div>}
        <section className="recent-section" aria-labelledby="recent-designs">
          <div className="section-heading"><h2 id="recent-designs">Continue designing</h2><span>{designs.length ? `${designs.length} local` : 'Nothing here yet'}</span></div>
          <div className="recent-rows">
            {designs.slice(0, 3).map((design) => (
              <Button className="recent-row" key={design.id} onPress={() => onOpen(design)}>
                {design.thumbnailDataUrl
                  ? <img alt={`Preview of ${design.title}`} className="mini-preview-image" src={design.thumbnailDataUrl} />
                  : <span className="mini-preview preview-sand" aria-hidden="true"><span className="preview-rail" /><span className="preview-line preview-line-long" /><span className="preview-line" /><span className="preview-block" /></span>}
                <span className="recent-copy"><strong>{design.title}</strong><small>{design.projectName} · {design.revisions.at(-1)?.prompt ?? 'Ready for a first direction'}</small></span>
                <span className="recent-time"><ClockIcon aria-hidden="true" />{new Date(design.updatedAt).toLocaleDateString()}</span>
                <ArrowRightIcon className="row-arrow" aria-hidden="true" />
              </Button>
            ))}
            {!designs.length && <div className="empty-designs"><DocumentDuplicateIcon aria-hidden="true" /><strong>Your first design starts above</strong><p>The development provider will generate, compile, validate, and save it locally.</p></div>}
          </div>
        </section>
      </div>
    </main>
  )
}

function PreviewSurface({ design }: { readonly design: OmniDesignDocument }) {
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

  return <div className="preview-surface" ref={surface}>{!revisionId && <p>Preview appears after the first valid revision.</p>}</div>
}

function DesignWorkspace({ design, activity, busy, onBack, onChange }: {
  readonly design: OmniDesignDocument
  readonly activity: GenerationActivity | null
  readonly busy: boolean
  readonly onBack: () => void
  readonly onChange: (design: OmniDesignDocument) => void
}) {
  const [draft, setDraft] = useState(design.draft)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [conversationWidth, setConversationWidth] = useState(design.layout.conversationWidth)
  const split = useRef<HTMLDivElement>(null)
  const selectedIsHead = design.selectedRevisionId === design.activeRevisionId
  const selectedRevision = design.revisions.find((revision) => revision.id === design.selectedRevisionId)
  const latestInvalidCandidate = design.invalidCandidates.at(-1)
  const activeJob = [...design.generationJobs].reverse().find((job) => ['queued', 'running'].includes(job.state))
  const retryableJob = [...design.generationJobs].reverse().find((job) => ['failed', 'cancelled', 'interrupted'].includes(job.state))
  const api = window.omnidesign?.workspace

  useEffect(() => setDraft(design.draft), [design.id, design.draft])
  useEffect(() => setConversationWidth(design.layout.conversationWidth), [design.id, design.layout.conversationWidth])
  useEffect(() => {
    if (!api) return
    const timer = window.setTimeout(() => { void api.saveDraft(design.id, draft) }, 300)
    return () => window.clearTimeout(timer)
  }, [api, design.id, draft])
  useEffect(() => {
    if (!api) return
    const timer = window.setTimeout(() => { void api.saveLayout(design.id, { conversationWidth }) }, 250)
    return () => window.clearTimeout(timer)
  }, [api, conversationWidth, design.id])

  const updateConversationWidth = (clientX: number) => {
    const bounds = split.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0) return
    setConversationWidth(Math.min(65, Math.max(35, ((clientX - bounds.left) / bounds.width) * 100)))
  }

  const submit = async () => {
    if (!api || !draft.trim() || busy || !selectedIsHead) return
    onChange(await api.generate(design.id, draft.trim()))
    setDraft('')
  }
  const selectRevision = async (revisionId: string) => {
    if (!api) return
    onChange(await api.selectRevision(design.id, revisionId))
    setHistoryOpen(false)
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

  return (
    <main className="workspace-main">
      <header className="workspace-toolbar">
        <IconButton label="Back to home" icon={ArrowLeftIcon} onPress={onBack} />
        <span className="workspace-title"><strong>{design.title}</strong><small>{busy ? activity?.stage ?? 'Working' : 'Saved locally'}</small></span>
        <div className="toolbar-actions">
          <Button className="toolbar-button" onPress={() => setHistoryOpen(!historyOpen)}><ClockIcon aria-hidden="true" />History · {design.revisions.length}</Button>
          <Button className="toolbar-button" onPress={() => void exportRevision()} isDisabled={!design.selectedRevisionId}><ArrowDownTrayIcon aria-hidden="true" />Export</Button>
        </div>
        {historyOpen && <div className="history-popover" aria-label="Revision history">
          <strong>Revision history</strong>
          {[...design.revisions].reverse().map((revision, index) => (
            <Button className="history-row" data-active={revision.id === design.selectedRevisionId || undefined} key={revision.id} onPress={() => void selectRevision(revision.id)}>
              {revision.thumbnailDataUrl
                ? <img alt={`Preview of revision ${index === 0 ? 'current head' : index + 1}`} className="history-thumbnail" src={revision.thumbnailDataUrl} />
                : <span className="history-thumbnail history-thumbnail-placeholder" aria-hidden="true" />}
              <span><strong>{index === 0 ? 'Current head' : new Date(revision.createdAt).toLocaleString()}</strong><small>{revision.prompt}</small></span>
            </Button>
          ))}
        </div>}
      </header>
      <div className="workspace-split" ref={split} style={{ gridTemplateColumns: `minmax(380px, ${conversationWidth}%) 8px minmax(0, 1fr)` }}>
        <section className="conversation-pane" aria-label="Design conversation">
          <div className="conversation-feed">
            {design.messages.map((message) => <article className={`conversation-message message-${message.role}`} key={message.id}><span>{message.role === 'user' ? 'You' : 'OmniDesign'}</span><p>{message.text}</p></article>)}
            {activity && busy && <div className="generation-progress" role="status"><ArrowPathIcon className="spin" aria-hidden="true" /><span><strong>{activity.stage}</strong>{activity.detail}</span>{activeJob && <Button className="secondary-action" onPress={() => void cancelGeneration()}><StopIcon aria-hidden="true" />Stop</Button>}</div>}
            {!activeJob && retryableJob && <div className="generation-recovery" role="status"><span><strong>{retryableJob.state}</strong>{retryableJob.error ?? 'Generation needs attention.'}</span><Button className="secondary-action" onPress={() => void retryGeneration()}><ArrowPathIcon aria-hidden="true" />Retry</Button></div>}
            {latestInvalidCandidate && <section className="invalid-candidate-notice" role="alert">
              <strong>Latest candidate was not activated</strong>
              <p>{latestInvalidCandidate.diagnostic}</p>
              <details><summary>Technical details</summary><pre>{latestInvalidCandidate.html}</pre></details>
            </section>}
          </div>
          {!selectedIsHead && <div className="historical-banner"><ClockIcon aria-hidden="true" /><span><strong>Viewing an earlier revision</strong>Restore it as a new head before prompting.</span><Button className="secondary-action" onPress={() => void restore()}>Restore revision</Button></div>}
          <div className="workspace-composer">
            <TextField aria-label="Request a design change"><TextArea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Describe the next change…" disabled={!selectedIsHead} onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() }
            }} /></TextField>
            <div className="workspace-composer-footer"><span><SparklesIcon aria-hidden="true" />Development provider · Mock model</span><Button className="submit-prompt" aria-label="Send change" isDisabled={!draft.trim() || busy || !selectedIsHead} onPress={() => void submit()}><ArrowRightIcon aria-hidden="true" /></Button></div>
          </div>
        </section>
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
        <section className="preview-pane" aria-label="Generated design preview">
          <div className="preview-toolbar"><span><CheckCircleIcon aria-hidden="true" />Isolated preview</span><small>{selectedRevision ? selectedRevision.diagnostics.length ? `${selectedRevision.diagnostics.length} diagnostic${selectedRevision.diagnostics.length === 1 ? '' : 's'} captured` : 'Offline · validated' : 'Waiting for revision'}</small></div>
          <PreviewSurface design={design} />
        </section>
      </div>
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
  const [activeDesign, setActiveDesign] = useState<OmniDesignDocument | null>(null)
  const [activity, setActivity] = useState<GenerationActivity | null>(null)
  const [busy, setBusy] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [providersOpen, setProvidersOpen] = useState(false)
  const [generationsOpen, setGenerationsOpen] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const providerState = useProviders()
  const workspaceApi = window.omnidesign?.workspace

  const updateDesign = useCallback((design: OmniDesignDocument) => {
    setActiveDesign(design)
    setDesigns((current) => current.map((candidate) => candidate.id === design.id ? design : candidate))
  }, [])

  const refresh = useCallback(async () => {
    if (!workspaceApi) return
    setDesigns(await workspaceApi.list())
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

  const create = async (prompt: string) => {
    if (!workspaceApi) return
    setBusy(true)
    try {
      const design = await workspaceApi.create(prompt)
      setActiveDesign(design)
      await refresh()
    } finally {
      setBusy(false)
    }
  }
  const changeTheme = (nextTheme: 'dark' | 'light') => {
    setTheme(nextTheme)
    document.documentElement.dataset.theme = nextTheme
    void window.omnidesign?.settings.saveTheme(nextTheme)
  }
  const home = () => { void window.omnidesign?.preview.hide(); setGenerationsOpen(false); setProvidersOpen(false); setSettingsOpen(false); setActiveDesign(null); setActivity(null); void refresh() }
  const openSettings = () => { void window.omnidesign?.preview.hide(); setGenerationsOpen(false); setProvidersOpen(false); setActiveDesign(null); setSettingsOpen(true) }
  const openProviders = () => { void window.omnidesign?.preview.hide(); setGenerationsOpen(false); setSettingsOpen(false); setActiveDesign(null); setProvidersOpen(true); providerState.refresh() }
  const openGenerations = () => { void window.omnidesign?.preview.hide(); setProvidersOpen(false); setSettingsOpen(false); setActiveDesign(null); setGenerationsOpen(true); void refresh() }
  const openDesign = (design: OmniDesignDocument) => { setGenerationsOpen(false); setProvidersOpen(false); setSettingsOpen(false); setActiveDesign(design) }
  const cancelGeneration = async (jobId: string) => {
    await workspaceApi?.cancelGeneration(jobId)
    await refresh()
  }

  return (
    <div className="app-frame">
      <Sidebar designs={designs} activeDesignId={activeDesign?.id ?? null} settingsOpen={settingsOpen} providersOpen={providersOpen} generationsOpen={generationsOpen} onHome={home} onOpen={openDesign} onSettings={openSettings} onProviders={openProviders} onGenerations={openGenerations} />
      {generationsOpen
        ? <Generations designs={designs} onOpen={openDesign} onCancel={cancelGeneration} />
        : providersOpen
        ? <Providers providers={providerState.providers} loading={providerState.loading} onRefresh={providerState.refresh} />
        : settingsOpen
        ? <Settings theme={theme} onThemeChange={changeTheme} />
        : activeDesign
        ? <DesignWorkspace design={activeDesign} activity={activity?.designId === activeDesign.id ? activity : null} busy={busy && activity?.designId === activeDesign.id} onBack={home} onChange={updateDesign} />
        : <Home designs={designs} providerLabel={providerState.label} busy={false} activity={activity} onCreate={create} onOpen={openDesign} />}
    </div>
  )
}
