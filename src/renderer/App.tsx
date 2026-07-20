import {
  ArrowRightIcon,
  BellIcon,
  BoltIcon,
  ChevronDownIcon,
  ClockIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  FolderIcon,
  HomeIcon,
  PaperClipIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { useEffect, useState } from 'react'
import type { ComponentType, KeyboardEvent, SVGProps } from 'react'
import { Button, TextArea, TextField, Tooltip, TooltipTrigger } from 'react-aria-components'

type Icon = ComponentType<SVGProps<SVGSVGElement>>

interface RecentItem {
  readonly title: string
  readonly project: string
  readonly prompt: string
  readonly time: string
  readonly palette: 'sand' | 'mauve' | 'olive'
}

interface ProjectItem {
  readonly name: string
  readonly designs: number
  readonly active?: boolean
}

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

function IconButton({ label, icon: IconComponent }: { readonly label: string; readonly icon: Icon }) {
  return (
    <TooltipTrigger delay={350}>
      <Button className="icon-button" aria-label={label}>
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

function Sidebar() {
  return (
    <aside className="sidebar" aria-label="Primary navigation">
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

function NewDesignComposer({ providerLabel }: { readonly providerLabel: string }) {
  const [prompt, setPrompt] = useState('')
  const submit = () => setPrompt('')
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && prompt.trim()) {
      event.preventDefault()
      submit()
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
          <Button className="project-context"><FolderIcon aria-hidden="true" />Standalone design<ChevronDownIcon aria-hidden="true" /></Button>
        </div>
        <div className="composer-controls">
          <Button className="control-button"><SparklesIcon aria-hidden="true" />{providerLabel}<ChevronDownIcon aria-hidden="true" /></Button>
          <Button className="control-button"><CommandLineIcon aria-hidden="true" />Auto model<ChevronDownIcon aria-hidden="true" /></Button>
        </div>
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

function RecentDesigns() {
  return (
    <section className="recent-section" aria-labelledby="recent-designs">
      <div className="section-heading"><h2 id="recent-designs">Continue designing</h2><Button className="text-button">View all</Button></div>
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
    </section>
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
  const providerLabel = useAvailableProvider()

  return (
    <div className="app-frame">
      <Sidebar />
      <main className="home-main">
        <div className="home-content">
          <header className="page-heading">
            <h1>Good afternoon, Simon.</h1>
            <p>Start with an idea. OmniDesign will turn it into something you can see, use, and refine.</p>
          </header>
          <NewDesignComposer providerLabel={providerLabel} />
          <RecentDesigns />
        </div>
      </main>
    </div>
  )
}
