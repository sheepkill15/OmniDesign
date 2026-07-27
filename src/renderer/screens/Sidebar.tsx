import { useState } from 'react'
import { Button, Tooltip, TooltipTrigger } from 'react-aria-components'
import { BellIcon, BoltIcon, ChevronRightIcon, Cog6ToothIcon, CommandLineIcon, DocumentDuplicateIcon, FolderIcon, HomeIcon, PlusIcon, RectangleStackIcon, SparklesIcon, TrashIcon } from '@heroicons/react/24/outline'
import { IconButton, type Icon } from '../components/common'

function NavigationItem({ icon: IconComponent, label, badge, active = false, onPress }: { readonly icon: Icon; readonly label: string; readonly badge?: string; readonly active?: boolean; readonly onPress?: () => void }) {
  return (
    <Button className="navigation-item" data-active={active || undefined} onPress={onPress}>
      <IconComponent aria-hidden="true" />
      <span>{label}</span>
      {badge && <span className="navigation-badge">{badge}</span>}
    </Button>
  )
}

function ProjectNavItem({ project, designs, activeProjectId, activeDesignId, onOpen, onOpenDesign, onAddDesign }: {
  readonly project: ProjectSummary
  readonly designs: readonly OmniDesignDocument[]
  readonly activeProjectId: string | null
  readonly activeDesignId: string | null
  readonly onOpen: (project: ProjectSummary) => void
  readonly onOpenDesign: (project: ProjectSummary, design: OmniDesignDocument) => void
  readonly onAddDesign: (project: ProjectSummary) => void
}) {
  const isStandalone = project.kind === 'standalone'
  const [expanded, setExpanded] = useState(false)
  const projectDesigns = designs.filter((design) => design.projectId === project.id)
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
          {projectDesigns.map((design) => (
            <Button className="design-subrow" data-active={design.id === activeDesignId || undefined} key={design.id} onPress={() => onOpenDesign(project, design)}>
              <span>{design.title}</span>
            </Button>
          ))}
          {!projectDesigns.length && <p className="design-sublist-empty">No designs yet.</p>}
        </div>
      )}
    </div>
  )
}

export function Sidebar({ projects, designs, activeProjectId, activeDesignId, activeGenerationCount, workspaceError, homeActive, libraryOpen, settingsOpen, providersOpen, generationsOpen, trashOpen, onHome, onLibrary, onOpen, onOpenDesign, onAddDesign, onSettings, onProviders, onGenerations, onTrash, onRetryWorkspace }: {
  readonly projects: readonly ProjectSummary[]
  readonly designs: readonly OmniDesignDocument[]
  readonly activeProjectId: string | null
  readonly activeDesignId: string | null
  readonly activeGenerationCount: number
  readonly workspaceError: string | null
  readonly homeActive: boolean
  readonly libraryOpen: boolean
  readonly settingsOpen: boolean
  readonly providersOpen: boolean
  readonly generationsOpen: boolean
  readonly trashOpen: boolean
  readonly onHome: () => void
  readonly onLibrary: () => void
  readonly onOpen: (project: ProjectSummary) => void
  readonly onOpenDesign: (project: ProjectSummary, design: OmniDesignDocument) => void
  readonly onAddDesign: (project: ProjectSummary) => void
  readonly onSettings: () => void
  readonly onProviders: () => void
  readonly onGenerations: () => void
  readonly onTrash: () => void
  readonly onRetryWorkspace: () => void
}) {
  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="brand-row">
        <span className="brand-mark" aria-hidden="true"><SparklesIcon /></span>
        <span className="brand-name">OmniDesign</span>
        <IconButton label="Generation activity" icon={BellIcon} onPress={onGenerations} />
      </div>
      {workspaceError && <div className="sidebar-workspace-error" role="alert"><strong>Workspace refresh failed</strong><small>{workspaceError}</small><Button className="text-button" onPress={onRetryWorkspace}>Retry</Button></div>}
      <nav className="global-navigation" aria-label="Application">
        <NavigationItem icon={HomeIcon} label="Home" active={homeActive} onPress={onHome} />
        <NavigationItem icon={RectangleStackIcon} label="Library" active={libraryOpen} onPress={onLibrary} />
        <NavigationItem icon={BoltIcon} label="Generations" badge={activeGenerationCount ? String(activeGenerationCount) : undefined} active={generationsOpen} onPress={onGenerations} />
      </nav>
      <div className="sidebar-section">
        <div className="sidebar-heading"><span>Projects</span><IconButton label="New design" icon={PlusIcon} onPress={onHome} /></div>
        <div className="project-navigation" aria-label="Projects">
          {projects.map((project) => (
            <ProjectNavItem key={project.id} project={project} designs={designs} activeProjectId={activeProjectId} activeDesignId={activeDesignId} onOpen={onOpen} onOpenDesign={onOpenDesign} onAddDesign={onAddDesign} />
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
