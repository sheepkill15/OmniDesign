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
  TrashIcon,
} from '@heroicons/react/24/outline'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ComponentType, KeyboardEvent, SVGProps } from 'react'
import { Button, TextArea, TextField, Tooltip, TooltipTrigger } from 'react-aria-components'

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

function Sidebar({ designs, activeDesignId, onHome, onOpen }: {
  readonly designs: readonly OmniDesignDocument[]
  readonly activeDesignId: string | null
  readonly onHome: () => void
  readonly onOpen: (design: OmniDesignDocument) => void
}) {
  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="brand-row">
        <span className="brand-mark" aria-hidden="true"><SparklesIcon /></span>
        <span className="brand-name">OmniDesign</span>
        <IconButton label="Notifications" icon={BellIcon} />
      </div>
      <nav className="global-navigation" aria-label="Application">
        <NavigationItem icon={HomeIcon} label="Home" active={!activeDesignId} onPress={onHome} />
        <NavigationItem icon={BoltIcon} label="Generations" />
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
        <NavigationItem icon={CommandLineIcon} label="Providers" />
        <NavigationItem icon={TrashIcon} label="Trash" />
        <NavigationItem icon={Cog6ToothIcon} label="Settings" />
        <div className="account-row"><span className="avatar">OD</span><span><strong>Local workspace</strong><small>Stored on this device</small></span></div>
      </div>
    </aside>
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
                <span className="mini-preview preview-sand" aria-hidden="true"><span className="preview-rail" /><span className="preview-line preview-line-long" /><span className="preview-line" /><span className="preview-block" /></span>
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
  const selectedIsHead = design.selectedRevisionId === design.activeRevisionId
  const selectedRevision = design.revisions.find((revision) => revision.id === design.selectedRevisionId)
  const api = window.omnidesign?.workspace

  useEffect(() => setDraft(design.draft), [design.id, design.draft])
  useEffect(() => {
    if (!api) return
    const timer = window.setTimeout(() => { void api.saveDraft(design.id, draft) }, 300)
    return () => window.clearTimeout(timer)
  }, [api, design.id, draft])

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
              <span>{index === 0 ? 'Current head' : new Date(revision.createdAt).toLocaleString()}</span><small>{revision.prompt}</small>
            </Button>
          ))}
        </div>}
      </header>
      <div className="workspace-split">
        <section className="conversation-pane" aria-label="Design conversation">
          <div className="conversation-feed">
            {design.messages.map((message) => <article className={`conversation-message message-${message.role}`} key={message.id}><span>{message.role === 'user' ? 'You' : 'OmniDesign'}</span><p>{message.text}</p></article>)}
            {activity && busy && <div className="generation-progress" role="status"><ArrowPathIcon className="spin" aria-hidden="true" /><span><strong>{activity.stage}</strong>{activity.detail}</span></div>}
          </div>
          {!selectedIsHead && <div className="historical-banner"><ClockIcon aria-hidden="true" /><span><strong>Viewing an earlier revision</strong>Restore it as a new head before prompting.</span><Button className="secondary-action" onPress={() => void restore()}>Restore revision</Button></div>}
          <div className="workspace-composer">
            <TextField aria-label="Request a design change"><TextArea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Describe the next change…" disabled={!selectedIsHead} onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit() }
            }} /></TextField>
            <div className="workspace-composer-footer"><span><SparklesIcon aria-hidden="true" />Development provider · Mock model</span><Button className="submit-prompt" aria-label="Send change" isDisabled={!draft.trim() || busy || !selectedIsHead} onPress={() => void submit()}><ArrowRightIcon aria-hidden="true" /></Button></div>
          </div>
        </section>
        <section className="preview-pane" aria-label="Generated design preview">
          <div className="preview-toolbar"><span><CheckCircleIcon aria-hidden="true" />Isolated preview</span><small>{selectedRevision ? selectedRevision.diagnostics.length ? `${selectedRevision.diagnostics.length} diagnostic${selectedRevision.diagnostics.length === 1 ? '' : 's'} captured` : 'Offline · validated' : 'Waiting for revision'}</small></div>
          <PreviewSurface design={design} />
        </section>
      </div>
    </main>
  )
}

function useAvailableProvider(): string {
  const [label, setLabel] = useState('Development provider')
  useEffect(() => {
    const api = window.omnidesign?.providers
    if (!api) return
    void api.discover().then((providers) => {
      const provider = providers.find((candidate) => candidate.installed && candidate.authenticated)
      if (provider) setLabel(`${provider.name} available · Development provider active`)
    }).catch(() => undefined)
  }, [])
  return label
}

export function App() {
  const [designs, setDesigns] = useState<OmniDesignDocument[]>([])
  const [activeDesign, setActiveDesign] = useState<OmniDesignDocument | null>(null)
  const [activity, setActivity] = useState<GenerationActivity | null>(null)
  const [busy, setBusy] = useState(false)
  const providerLabel = useAvailableProvider()
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
  useEffect(() => workspaceApi?.onActivity((next) => {
    setActivity(next)
    setBusy(!['complete', 'failed'].includes(next.stage))
  }), [workspaceApi])
  useEffect(() => window.omnidesign?.preview.onDiagnostic((event) => {
    if (event.designId !== activeDesign?.id || !workspaceApi) return
    void workspaceApi.get(event.designId).then((design) => { if (design) updateDesign(design) })
  }), [activeDesign?.id, updateDesign, workspaceApi])

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
  const home = () => { void window.omnidesign?.preview.hide(); setActiveDesign(null); setActivity(null); void refresh() }

  return (
    <div className="app-frame">
      <Sidebar designs={designs} activeDesignId={activeDesign?.id ?? null} onHome={home} onOpen={setActiveDesign} />
      {activeDesign
        ? <DesignWorkspace design={activeDesign} activity={activity?.designId === activeDesign.id ? activity : null} busy={busy} onBack={home} onChange={updateDesign} />
        : <Home designs={designs} providerLabel={providerLabel} busy={busy} activity={activity} onCreate={create} onOpen={setActiveDesign} />}
    </div>
  )
}
