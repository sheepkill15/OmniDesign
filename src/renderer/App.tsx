import {
  ArrowRightIcon,
  BellIcon,
  BoltIcon,
  ChevronDownIcon,
  ClockIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  CubeTransparentIcon,
  FolderIcon,
  HomeIcon,
  MoonIcon,
  PaperClipIcon,
  PlusIcon,
  RectangleStackIcon,
  SparklesIcon,
  SunIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import type { ComponentType, KeyboardEvent, SVGProps } from 'react'
import { Button, TextArea, TextField, Tooltip, TooltipTrigger } from 'react-aria-components'

type ConceptId = 'studio' | 'gallery' | 'workbench'
type Theme = 'dark' | 'light'
type Icon = ComponentType<SVGProps<SVGSVGElement>>

interface ProjectItem {
  readonly name: string
  readonly designs: number
  readonly active?: boolean
}

interface RecentItem {
  readonly title: string
  readonly project: string
  readonly prompt: string
  readonly time: string
  readonly palette: 'sand' | 'mauve' | 'olive'
}

const concepts: readonly { id: ConceptId; label: string; description: string }[] = [
  { id: 'studio', label: 'A · Quiet studio', description: 'Conversation-led and restrained' },
  { id: 'gallery', label: 'B · Visual gallery', description: 'Preview-led and editorial' },
  { id: 'workbench', label: 'C · Project workbench', description: 'Denser and developer-focused' },
]

const projects: readonly ProjectItem[] = [
  { name: 'Northstar', designs: 4, active: true },
  { name: 'Parcel', designs: 2 },
  { name: 'Lumen', designs: 1 },
]

const recents: readonly RecentItem[] = [
  { title: 'Analytics overview', project: 'Northstar', prompt: 'Make the trends easier to scan at a glance', time: '12 min ago', palette: 'sand' },
  { title: 'Checkout flow', project: 'Parcel', prompt: 'Reduce friction in the delivery step', time: 'Yesterday', palette: 'mauve' },
  { title: 'Launch page', project: 'Lumen', prompt: 'Give the hero more confidence and warmth', time: 'Friday', palette: 'olive' },
]

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

function NavigationItem({ icon: IconComponent, label, badge, active = false }: { readonly icon: Icon; readonly label: string; readonly badge?: string; readonly active?: boolean }) {
  return (
    <Button className="navigation-item" data-active={active || undefined}>
      <IconComponent aria-hidden="true" />
      <span>{label}</span>
      {badge && <span className="navigation-badge">{badge}</span>}
    </Button>
  )
}

function StandardSidebar() {
  return (
    <aside className="sidebar" data-variant="standard" aria-label="Primary navigation">
      <div className="brand-row">
        <span className="brand-mark" aria-hidden="true"><SparklesIcon /></span>
        <span className="brand-name">OmniDesign</span>
        <IconButton label="Notifications" icon={BellIcon} />
      </div>

      <nav className="global-navigation" aria-label="Application">
        <NavigationItem icon={HomeIcon} label="Home" active />
        <NavigationItem icon={BoltIcon} label="Generations" badge="2" />
      </nav>

      <div className="sidebar-section">
        <div className="sidebar-heading">
          <span>Projects</span>
          <IconButton label="Add project" icon={PlusIcon} />
        </div>
        <div className="project-navigation">
          {projects.map((project) => (
            <Button className="project-row" data-active={project.active || undefined} key={project.name}>
              <FolderIcon aria-hidden="true" />
              <span>{project.name}</span>
              <span>{project.designs}</span>
            </Button>
          ))}
        </div>
      </div>

      <div className="sidebar-footer">
        <NavigationItem icon={CommandLineIcon} label="Providers" />
        <NavigationItem icon={TrashIcon} label="Trash" />
        <NavigationItem icon={Cog6ToothIcon} label="Settings" />
        <div className="account-row">
          <span className="avatar">SI</span>
          <span><strong>Simon</strong><small>Local workspace</small></span>
          <ChevronDownIcon aria-hidden="true" />
        </div>
      </div>
    </aside>
  )
}

function GallerySidebar() {
  return (
    <aside className="gallery-sidebar" data-variant="gallery" aria-label="Primary navigation">
      <nav className="gallery-rail" aria-label="Application">
        <span className="brand-mark" aria-label="OmniDesign"><SparklesIcon aria-hidden="true" /></span>
        <IconButton label="Home" icon={HomeIcon} />
        <IconButton label="Generations, 2 active" icon={BoltIcon} />
        <span className="rail-spacer" />
        <IconButton label="Providers" icon={CommandLineIcon} />
        <IconButton label="Trash" icon={TrashIcon} />
        <IconButton label="Settings" icon={Cog6ToothIcon} />
        <span className="avatar">SI</span>
      </nav>
      <div className="gallery-projects">
        <div className="gallery-sidebar-title">
          <span><small>Workspace</small><strong>Projects</strong></span>
          <IconButton label="Add project" icon={PlusIcon} />
        </div>
        <div className="gallery-project-list">
          {projects.map((project) => (
            <Button className="gallery-project" data-active={project.active || undefined} key={project.name}>
              <span className="project-monogram">{project.name.slice(0, 1)}</span>
              <span><strong>{project.name}</strong><small>{project.designs} {project.designs === 1 ? 'design' : 'designs'}</small></span>
              <ChevronDownIcon aria-hidden="true" />
            </Button>
          ))}
        </div>
        <Button className="open-project-button"><FolderIcon aria-hidden="true" />Open local project</Button>
      </div>
    </aside>
  )
}

function WorkbenchSidebar() {
  return (
    <aside className="workbench-sidebar" data-variant="workbench" aria-label="Primary navigation">
      <span className="workbench-brand" aria-label="OmniDesign"><CubeTransparentIcon aria-hidden="true" /></span>
      <nav className="workbench-navigation" aria-label="Application">
        <IconButton label="Home" icon={HomeIcon} />
        <span className="rail-rule" />
        {projects.map((project) => (
          <TooltipTrigger key={project.name} delay={300}>
            <Button className="workbench-project" data-active={project.active || undefined} aria-label={project.name}>{project.name.slice(0, 2).toUpperCase()}</Button>
            <Tooltip className="tooltip">{project.name} · {project.designs} designs</Tooltip>
          </TooltipTrigger>
        ))}
        <IconButton label="Add project" icon={PlusIcon} />
      </nav>
      <nav className="workbench-utilities" aria-label="Utilities">
        <IconButton label="Generations, 2 active" icon={BoltIcon} />
        <IconButton label="Providers" icon={CommandLineIcon} />
        <IconButton label="Settings" icon={Cog6ToothIcon} />
        <span className="avatar">SI</span>
      </nav>
    </aside>
  )
}

function ProviderControl({ providerLabel }: { readonly providerLabel: string }) {
  return (
    <div className="composer-controls">
      <Button className="control-button"><SparklesIcon aria-hidden="true" />{providerLabel}<ChevronDownIcon aria-hidden="true" /></Button>
      <Button className="control-button"><CommandLineIcon aria-hidden="true" />Auto model<ChevronDownIcon aria-hidden="true" /></Button>
    </div>
  )
}

function NewDesignComposer({ providerLabel, roomy = false, label = 'What would you like to design?' }: { readonly providerLabel: string; readonly roomy?: boolean; readonly label?: string }) {
  const [prompt, setPrompt] = useState('')
  const submit = () => setPrompt('')
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && prompt.trim()) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <section className="new-design-composer" data-roomy={roomy || undefined} aria-label="Create a design">
      <TextField className="prompt-field" aria-label={label}>
        <TextArea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={onKeyDown} placeholder={label} />
      </TextField>
      <div className="composer-footer">
        <div className="composer-leading">
          <IconButton label="Attach files or folders" icon={PaperClipIcon} />
          <Button className="project-context"><FolderIcon aria-hidden="true" />Standalone design<ChevronDownIcon aria-hidden="true" /></Button>
        </div>
        <ProviderControl providerLabel={providerLabel} />
        <Button className="submit-prompt" aria-label="Create design" isDisabled={!prompt.trim()} onPress={submit}>
          <ArrowRightIcon aria-hidden="true" />
        </Button>
      </div>
    </section>
  )
}

function MiniPreview({ palette }: { readonly palette: RecentItem['palette'] }) {
  return (
    <div className={`mini-preview preview-${palette}`} aria-hidden="true">
      <span className="preview-rail" />
      <span className="preview-line preview-line-long" />
      <span className="preview-line" />
      <span className="preview-block" />
      <span className="preview-block preview-block-secondary" />
    </div>
  )
}

function RecentRows() {
  return (
    <div className="recent-rows">
      {recents.map((item) => (
        <Button className="recent-row" key={item.title}>
          <MiniPreview palette={item.palette} />
          <span className="recent-copy"><strong>{item.title}</strong><small>{item.project} · {item.prompt}</small></span>
          <span className="recent-time"><ClockIcon aria-hidden="true" />{item.time}</span>
          <ArrowRightIcon className="row-arrow" aria-hidden="true" />
        </Button>
      ))}
    </div>
  )
}

function RecentTiles() {
  return (
    <div className="recent-tiles">
      {recents.map((item) => (
        <Button className="recent-tile" key={item.title}>
          <MiniPreview palette={item.palette} />
          <span className="tile-meta"><span><strong>{item.title}</strong><small>{item.project}</small></span><small>{item.time}</small></span>
        </Button>
      ))}
    </div>
  )
}

function PageHeading({ eyebrow, title, detail }: { readonly eyebrow?: string; readonly title: string; readonly detail: string }) {
  return (
    <header className="page-heading">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      <p>{detail}</p>
    </header>
  )
}

function QuietStudio({ providerLabel }: { readonly providerLabel: string }) {
  return (
    <div className="concept concept-studio">
      <StandardSidebar />
      <main className="home-main">
        <div className="studio-content">
          <PageHeading title="Good afternoon, Simon." detail="Start with an idea. OmniDesign will turn it into something you can see, use, and refine." />
          <NewDesignComposer providerLabel={providerLabel} roomy />
          <section className="recent-section" aria-labelledby="studio-recents">
            <div className="section-heading"><h2 id="studio-recents">Continue designing</h2><Button className="text-button">View all</Button></div>
            <RecentRows />
          </section>
        </div>
      </main>
    </div>
  )
}

function VisualGallery({ providerLabel }: { readonly providerLabel: string }) {
  return (
    <div className="concept concept-gallery">
      <GallerySidebar />
      <main className="home-main">
        <div className="gallery-content">
          <PageHeading eyebrow="Home" title="Make the next version visible." detail="Describe a direction, choose its context, and start shaping the interface together." />
          <NewDesignComposer providerLabel={providerLabel} label="Describe the screen, flow, or direction you have in mind…" />
          <section className="recent-section" aria-labelledby="gallery-recents">
            <div className="section-heading"><h2 id="gallery-recents">Recent work</h2><span className="section-detail">Updated across 3 projects</span></div>
            <RecentTiles />
          </section>
          <div className="gallery-note"><RectangleStackIcon aria-hidden="true" /><span><strong>Built for real projects</strong><small>Open a local folder to carry its design language into your next concept.</small></span><Button className="secondary-button">Open a project</Button></div>
        </div>
      </main>
    </div>
  )
}

function ProjectWorkbench({ providerLabel }: { readonly providerLabel: string }) {
  return (
    <div className="concept concept-workbench">
      <WorkbenchSidebar />
      <main className="home-main">
        <div className="workbench-topbar"><span><span className="status-dot" />All systems ready</span><Button className="secondary-button"><FolderIcon aria-hidden="true" />Open local project</Button></div>
        <div className="workbench-content">
          <div className="workbench-intro">
            <PageHeading eyebrow="New design" title="What are we building?" detail="Give the model a clear outcome. Add a project when its existing patterns should guide the result." />
            <NewDesignComposer providerLabel={providerLabel} label="Design a responsive settings screen for…" />
          </div>
          <aside className="activity-pane" aria-labelledby="activity-title">
            <div className="section-heading"><h2 id="activity-title">Workspace activity</h2><IconButton label="Activity options" icon={ChevronDownIcon} /></div>
            {recents.map((item, index) => (
              <Button className="activity-item" key={item.title}>
                <span className="activity-index">0{index + 1}</span>
                <span><strong>{item.title}</strong><small>{item.project} · {item.time}</small><span>{item.prompt}</span></span>
              </Button>
            ))}
          </aside>
        </div>
        <div className="workbench-footer"><span>OmniDesign works locally</span><span>3 projects · 7 designs</span><span>No cloud required</span></div>
      </main>
    </div>
  )
}

function useAvailableProvider(): string {
  const [label, setLabel] = useState('Set up provider')

  useEffect(() => {
    const api = window.omnidesign?.providers
    if (!api) return
    void api.discover().then((providers) => {
      const provider = providers.find((candidate) => candidate.installed && candidate.authenticated)
      if (provider) setLabel(provider.name)
    }).catch(() => undefined)
  }, [])

  return label
}

export function App() {
  const [concept, setConcept] = useState<ConceptId>('studio')
  const [theme, setTheme] = useState<Theme>('dark')
  const providerLabel = useAvailableProvider()

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return (
    <div className="design-review-shell">
      <div className="review-bar">
        <div className="review-context"><span>Phase 1 home</span><strong>Choose a visual direction</strong></div>
        <div className="concept-picker" role="group" aria-label="Home page concept">
          {concepts.map((option) => (
            <TooltipTrigger key={option.id} delay={250}>
              <Button className="concept-button" data-active={concept === option.id || undefined} onPress={() => setConcept(option.id)}>{option.label}</Button>
              <Tooltip className="tooltip">{option.description}</Tooltip>
            </TooltipTrigger>
          ))}
        </div>
        <IconButton label={`Use ${theme === 'dark' ? 'light' : 'dark'} theme`} icon={theme === 'dark' ? SunIcon : MoonIcon} onPress={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} />
      </div>
      {concept === 'studio' && <QuietStudio providerLabel={providerLabel} />}
      {concept === 'gallery' && <VisualGallery providerLabel={providerLabel} />}
      {concept === 'workbench' && <ProjectWorkbench providerLabel={providerLabel} />}
    </div>
  )
}
