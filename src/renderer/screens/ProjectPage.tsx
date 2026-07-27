import { useEffect, useState } from 'react'
import { Button, Menu, MenuItem } from 'react-aria-components'
import { ArrowPathIcon, DocumentDuplicateIcon, FolderIcon, SwatchIcon, TrashIcon } from '@heroicons/react/24/outline'
import { DropdownButton } from '../components/DropdownButton'
import { EditableTitle, ProjectThumbnail } from '../components/common'
import { NewDesignComposer, type ProviderId } from '../components/composer'

export function ProjectPage({ project, projects, designs, providers, busy, activity, onCreate, onOpenDesign, onRenameProject, onDesignRenamed, onReconnect, onConvertToStandalone, onTrashProject, onRefresh, onOpenProviders, onOpenDefinitions }: {
  readonly project: ProjectSummary
  readonly projects: readonly ProjectSummary[]
  readonly designs: readonly OmniDesignDocument[]
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
  readonly onRefresh: () => Promise<void>
  readonly onOpenProviders: () => void
  readonly onOpenDefinitions: () => void
}) {
  const [pendingAction, setPendingAction] = useState<'reconnect' | 'convert' | 'remove' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  useEffect(() => { setSelectedIds(new Set()) }, [project.id])
  const projectDesigns = designs.filter((design) => design.projectId === project.id)
  const toggleSelected = (designId: string) => setSelectedIds((current) => {
    const next = new Set(current)
    if (next.has(designId)) next.delete(designId); else next.add(designId)
    return next
  })
  const moveTargets = projects.filter((candidate) => candidate.id !== project.id)
  const runBulk = async (operation: (designId: string) => Promise<unknown>, failure: string) => {
    setBulkBusy(true)
    setActionError(null)
    try {
      for (const id of selectedIds) await operation(id)
      setSelectedIds(new Set())
      await onRefresh()
    } catch (reason) {
      setActionError(`${failure}${reason instanceof Error && reason.message ? ` ${reason.message}` : ''}`)
    } finally {
      setBulkBusy(false)
    }
  }
  const bulkTrash = () => runBulk((id) => window.omnidesign!.workspace.trash('design', id), 'Some designs could not be removed.')
  const bulkMove = (projectId: string) => runBulk((id) => window.omnidesign!.workspace.associateDesign(id, projectId), 'Some designs could not be moved.')
  const runProjectAction = async (action: 'reconnect' | 'convert' | 'remove', operation: () => Promise<void>, failure: string) => {
    setPendingAction(action)
    setActionError(null)
    try {
      await operation()
    } catch (reason) {
      setActionError(`${failure}${reason instanceof Error && reason.message ? ` ${reason.message}` : ''}`)
    } finally {
      setPendingAction(null)
    }
  }
  const renameDesign = async (design: OmniDesignDocument, title: string) => {
    const renamed = await window.omnidesign?.workspace.renameDesign(design.id, title)
    if (!renamed) throw new Error('The design could not be renamed.')
    onDesignRenamed(renamed)
  }

  return (
    <main className="home-main">
      <div className="home-content">
        <header className="page-heading">
          <EditableTitle value={project.name} label="project" variant="page" onSave={(name) => onRenameProject(project, name)} />
          <p>{project.kind === 'linked' ? (project.sourceAvailable ? project.sourceProjectPath ?? 'Linked project' : 'Linked source folder is unavailable') : 'Standalone project'}</p>
          {project.kind === 'linked' && !project.sourceAvailable && <div className="generation-recovery" role="status"><span><strong>Source folder unavailable.</strong> Your saved designs are safe; reconnect the folder or keep this project standalone.</span><Button className="secondary-action" isDisabled={pendingAction !== null} onPress={() => void runProjectAction('reconnect', () => onReconnect(project), 'The project folder could not be reconnected.')}>{pendingAction === 'reconnect' ? 'Reconnecting…' : 'Reconnect folder'}</Button><Button className="secondary-action" isDisabled={pendingAction !== null} onPress={() => void runProjectAction('convert', () => onConvertToStandalone(project), 'The project could not be converted.')}>{pendingAction === 'convert' ? 'Converting…' : 'Convert to standalone'}</Button></div>}
          <div className="page-heading-actions"><Button className="secondary-action" onPress={onOpenDefinitions}><SwatchIcon aria-hidden="true" />Design definitions</Button><Button className="secondary-action" isDisabled={pendingAction !== null} onPress={() => void runProjectAction('remove', () => onTrashProject(project), 'The project could not be moved to Trash.')}><TrashIcon aria-hidden="true" />{pendingAction === 'remove' ? 'Removing…' : 'Remove project'}</Button></div>
        </header>
        {actionError && <div className="workspace-feedback" data-tone="error" role="alert"><span><strong>Project action failed.</strong><small>{actionError}</small></span><Button className="text-button" onPress={() => setActionError(null)}>Dismiss</Button></div>}
        <NewDesignComposer providers={providers} busy={busy} fixedProject={project} onCreate={onCreate} onOpenProviders={onOpenProviders} />
        {busy && <div className="generation-notice" role="status"><ArrowPathIcon className="spin" aria-hidden="true" /><span><strong>{activity?.detail ?? 'Setting up design repository…'}</strong></span></div>}
        <section className="recent-section" aria-labelledby="project-designs">
          <div className="section-heading"><h2 id="project-designs">Designs</h2><span>{projectDesigns.length ? `${projectDesigns.length} design${projectDesigns.length === 1 ? '' : 's'}` : 'No designs yet'}</span></div>
          {selectedIds.size > 0 && (
            <div className="bulk-action-bar" role="group" aria-label="Bulk design actions">
              <span>{selectedIds.size} selected</span>
              {moveTargets.length > 0 && (
                <DropdownButton label="Move selected to project" triggerClassName="secondary-action" popoverClassName="project-popover" placement="bottom" isDisabled={bulkBusy} trigger={<><FolderIcon aria-hidden="true" />Move to…</>}>
                  <Menu aria-label="Move selected designs to" onAction={(key) => void bulkMove(String(key))}>
                    {moveTargets.map((candidate) => <MenuItem id={candidate.id} key={candidate.id}>{candidate.name}</MenuItem>)}
                  </Menu>
                </DropdownButton>
              )}
              <Button className="secondary-action danger-action" isDisabled={bulkBusy} onPress={() => void bulkTrash()}><TrashIcon aria-hidden="true" />{bulkBusy ? 'Removing…' : 'Remove'}</Button>
              <Button className="text-button" isDisabled={bulkBusy} onPress={() => setSelectedIds(new Set())}>Clear</Button>
            </div>
          )}
          {projectDesigns.length
            ? <div className="design-grid" role="group" aria-label="Designs in this project">
                {projectDesigns.map((design) => {
                  const activeJob = [...design.generationJobs].reverse().find((job) => ['queued', 'running'].includes(job.state))
                  const status = design.queuePaused ? 'Queue paused' : activeJob ? (activeJob.state === 'queued' ? 'Queued' : 'Generating') : 'Saved locally'
                  return (
                    <article className="design-card" data-selected={selectedIds.has(design.id) || undefined} key={design.id}>
                      <label className="design-card-select"><input type="checkbox" checked={selectedIds.has(design.id)} onChange={() => toggleSelected(design.id)} aria-label={`Select ${design.title}`} /></label>
                      <Button aria-label={`Open ${design.title}`} className="design-card-open" onPress={() => onOpenDesign(design)}><span className="design-card-thumb"><ProjectThumbnail title={design.title} thumbnailDataUrl={design.thumbnailDataUrl} /></span></Button>
                      <span className="design-card-body">
                        <EditableTitle value={design.title} label={`${design.title} design`} variant="card" pending={design.titlePending} onSave={(title) => renameDesign(design, title)} />
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
