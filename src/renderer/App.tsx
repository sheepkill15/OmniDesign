import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from 'react-aria-components'
import { ArrowRightIcon, PencilSquareIcon, SparklesIcon, SwatchIcon } from '@heroicons/react/24/outline'
import { promptMentionsProject } from './promptMatch'
import { Library } from './screens/Library'
import { Sidebar } from './screens/Sidebar'
import { Home } from './screens/Home'
import { ProjectPage } from './screens/ProjectPage'
import { Generations } from './screens/Generations'
import { Providers } from './screens/Providers'
import { Trash } from './screens/Trash'
import { Settings } from './screens/Settings'
import { DesignWorkspace } from './screens/DesignWorkspace'
import { DesignDefinitions } from './screens/DesignDefinitions'
import { AppModal } from './components/AppModal'
import type { ProviderId } from './components/composer'

const developmentProvider: ProviderStatus = {
  id: 'mock',
  name: 'Development provider',
  installed: true,
  authenticated: true,
  detail: 'Available for local development and automated testing.',
  models: [{ id: 'mock-v1', name: 'Mock v1', effortLevels: [] }],
}

function useProviders(): { readonly providers: readonly ProviderStatus[]; readonly loading: boolean; readonly error: string | null; readonly refresh: () => void } {
  const developmentEnabled = import.meta.env.DEV || window.omnidesign?.providers.developmentProviderEnabled
  const [providers, setProviders] = useState<ProviderStatus[]>(developmentEnabled ? [developmentProvider] : [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(() => {
    const api = window.omnidesign?.providers
    if (!api) { setLoading(false); return }
    setLoading(true)
    setError(null)
    void api.refresh().then(setProviders).catch((reason: unknown) => {
      setError(reason instanceof Error && reason.message ? reason.message : 'Provider discovery failed unexpectedly.')
    }).finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    const api = window.omnidesign?.providers
    if (!api) { setLoading(false); return }
    let active = true
    let receivedUpdate = false
    const applyUpdate = (available: readonly ProviderStatus[]) => {
      receivedUpdate = true
      if (active) setProviders([...available])
    }
    const unsubscribe = api.onUpdated(applyUpdate)
    void api.getCached().then((available) => {
      if (active && !receivedUpdate) setProviders(available)
    }).catch(() => undefined).finally(() => { if (active) refresh() })
    return () => { active = false; unsubscribe() }
  }, [refresh])
  return { providers, loading, error, refresh }
}

function useLocalDependencies(): { readonly dependencies: readonly LocalDependencyStatus[]; readonly loading: boolean; readonly error: string | null; readonly refresh: () => void } {
  const [dependencies, setDependencies] = useState<LocalDependencyStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(() => {
    const api = window.omnidesign?.environment
    if (!api) { setLoading(false); return }
    setLoading(true)
    setError(null)
    void api.discover().then(setDependencies).catch((reason: unknown) => {
      setError(reason instanceof Error && reason.message ? reason.message : 'Local tools could not be checked.')
    }).finally(() => setLoading(false))
  }, [])
  useEffect(refresh, [refresh])
  return { dependencies, loading, error, refresh }
}

export function App() {
  const [designs, setDesigns] = useState<OmniDesignDocument[]>([])
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [tags, setTags] = useState<Tag[]>([])
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
  const [trashOpen, setTrashOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [definitionsProject, setDefinitionsProject] = useState<ProjectSummary | null>(null)
  const [definitionSetupPath, setDefinitionSetupPath] = useState<'proposal' | 'manual' | null>(null)
  const [definitionPromptProject, setDefinitionPromptProject] = useState<ProjectSummary | null>(null)
  const [definitionSetupChooserProject, setDefinitionSetupChooserProject] = useState<ProjectSummary | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [generationDetail, setGenerationDetail] = useState<'full' | 'concise'>('full')
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)
  const providerState = useProviders()
  const localDependencyState = useLocalDependencies()
  const workspaceApi = window.omnidesign?.workspace
  // Reopen the design that was open when the app last closed (its page is restored from the design's own
  // persisted layout). `restoreDone` gates the persistence effect so it never writes over the stored id
  // before we have read and applied it.
  const initStarted = useRef(false)
  const restoreDone = useRef(false)
  const definitionPromptsSeen = useRef(new Set<string>())

  const updateDesign = useCallback((design: OmniDesignDocument) => {
    // Ignore a snapshot older than what we already hold. Async refreshes (e.g. a generation `get` that
    // read the design just before a project move) can resolve out of order and would otherwise clobber
    // fresher state — such as a just-applied move's pending "adapt to project" decision — back to stale.
    const freshest = (current: OmniDesignDocument | null) => current?.id === design.id && current.updatedAt > design.updatedAt ? current : design
    setActiveDesign((current) => current?.id === design.id ? freshest(current) : current)
    setDesigns((current) => current.map((candidate) => candidate.id === design.id ? freshest(candidate) : candidate))
  }, [])

  const refresh = useCallback(async () => {
    if (!workspaceApi) return false
    try {
      const [nextDesigns, nextProjects, nextTrash, nextFolders, nextTags] = await Promise.all([workspaceApi.list(), workspaceApi.listProjects(), workspaceApi.listTrash(), workspaceApi.listFolders(), workspaceApi.listTags()])
      setDesigns((current) => nextDesigns.map((next) => {
        const existing = current.find((design) => design.id === next.id)
        return existing && existing.updatedAt >= next.updatedAt ? existing : next
      }))
      setProjects(nextProjects)
      setActiveProject((current) => current ? nextProjects.find((project) => project.id === current.id) ?? null : null)
      setTrashItems(nextTrash)
      setFolders(nextFolders)
      setTags(nextTags)
      setWorkspaceError(null)
      return true
    } catch (reason) {
      setWorkspaceError(reason instanceof Error && reason.message ? reason.message : 'The local workspace could not be read.')
      return false
    }
  }, [workspaceApi])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const api = window.omnidesign?.settings
    if (!api) return
    void api.getTheme().then((savedTheme) => {
      setTheme(savedTheme)
      document.documentElement.dataset.theme = savedTheme
    }).catch((reason: unknown) => setSettingsError(`Theme could not be loaded. ${reason instanceof Error ? reason.message : ''}`.trim()))
    void api.getNotificationsEnabled().then(setNotificationsEnabled).catch((reason: unknown) => setSettingsError(`Notification preference could not be loaded. ${reason instanceof Error ? reason.message : ''}`.trim()))
    void api.getGenerationDetail().then(setGenerationDetail).catch((reason: unknown) => setSettingsError(`Generation detail preference could not be loaded. ${reason instanceof Error ? reason.message : ''}`.trim()))
  }, [])
  // Restore the last-open design on launch. Runs once; fetches its own copy so it does not depend on the
  // main refresh having finished. A stored id whose design is gone (trashed/purged) is cleared and the app
  // starts on Home. Failures fall back to Home silently.
  useEffect(() => {
    if (initStarted.current || !workspaceApi) return
    initStarted.current = true
    void (async () => {
      try {
        const lastId = await window.omnidesign?.settings.getLastOpenDesignId()
        if (lastId) {
          const [design, projectList] = await Promise.all([workspaceApi.get(lastId), workspaceApi.listProjects()])
          if (design) {
            const project = projectList.find((candidate) => candidate.id === design.projectId)
            setActiveProject(project && project.kind === 'linked' && project.designCount > 1 ? project : null)
            setActiveDesign(design)
          } else {
            void window.omnidesign?.settings.saveLastOpenDesignId(null)
          }
        }
      } catch { /* start on Home */ }
      finally { restoreDone.current = true }
    })()
  }, [workspaceApi])
  // Persist which design is open (null once none is), so the next launch can reopen it. Gated until the
  // restore above has run, so the initial null render never clobbers the stored id before it is read.
  useEffect(() => {
    if (!restoreDone.current) return
    void window.omnidesign?.settings.saveLastOpenDesignId(activeDesign?.id ?? null)
  }, [activeDesign?.id])
  useEffect(() => {
    if (!workspaceApi) return
    return workspaceApi.onActivity((next) => {
      setActivitiesByDesign((current) => ({ ...current, [next.designId]: next }))
      const finished = ['complete', 'failed', 'cancelled', 'interrupted'].includes(next.stage)
      void workspaceApi.get(next.designId).then((design) => { if (design) updateDesign(design) }).catch((reason: unknown) => setWorkspaceError(reason instanceof Error ? reason.message : 'The active design could not be refreshed.'))
      if (finished) void refresh()
    })
  }, [refresh, updateDesign, workspaceApi])
  useEffect(() => workspaceApi?.onChanged(({ designId }) => {
    void workspaceApi.get(designId).then((design) => { if (design) updateDesign(design) }).catch((reason: unknown) => setWorkspaceError(reason instanceof Error ? reason.message : 'The changed design could not be refreshed.'))
    void refresh()
  }), [refresh, updateDesign, workspaceApi])
  useEffect(() => window.omnidesign?.preview.onThumbnail((event) => {
    void refresh()
    if (event.designId !== activeDesign?.id || !workspaceApi) return
    void workspaceApi.get(event.designId).then((design) => { if (design) updateDesign(design) }).catch((reason: unknown) => setWorkspaceError(reason instanceof Error ? reason.message : 'The generated thumbnail could not refresh the design.'))
  }), [activeDesign?.id, refresh, updateDesign, workspaceApi])

  useEffect(() => {
    if (definitionsProject || definitionPromptProject || definitionSetupChooserProject) return
    const project = activeDesign ? projects.find((candidate) => candidate.id === activeDesign.projectId) : activeProject
    if (!project || project.currentDefinitionVersion !== null || project.definitionPromptSuppressed || definitionPromptsSeen.current.has(project.id)) return
    const hasEngagedWithFirstResult = !activeDesign
      || activeDesign.revisions.length > 1
      || activeDesign.messages.filter((message) => message.role === 'user').length > 1
    if (!hasEngagedWithFirstResult) return
    const hasActiveWork = activeDesign?.projectId === project.id && activeDesign.generationJobs.some((job) => job.state === 'queued' || job.state === 'running')
    const hasUnsavedInput = activeDesign?.projectId === project.id && (Boolean(activeDesign.draft.trim()) || activeDesign.draftAttachments.length > 0)
    if (hasActiveWork || hasUnsavedInput) return
    definitionPromptsSeen.current.add(project.id)
    setDefinitionPromptProject(project)
  }, [activeDesign, activeProject, definitionPromptProject, definitionSetupChooserProject, definitionsProject, projects])

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
        const matchingProject = availableProjects.find((project) => project.kind === 'linked' && promptMentionsProject(prompt, project.name))
        if (matchingProject) setAssociationNotice({ designId: design.id, projectId: matchingProject.id, projectName: matchingProject.name, mode: 'suggested' })
      }
      await refresh()
    } finally {
      setCreating(false)
    }
  }
  const changeTheme = async (nextTheme: 'dark' | 'light') => {
    const previous = theme
    setTheme(nextTheme)
    document.documentElement.dataset.theme = nextTheme
    try {
      await window.omnidesign?.settings.saveTheme(nextTheme)
      setSettingsError(null)
    } catch (reason) {
      setTheme(previous)
      document.documentElement.dataset.theme = previous
      throw reason
    }
  }
  const closePanels = () => { setGenerationsOpen(false); setProvidersOpen(false); setSettingsOpen(false); setTrashOpen(false); setLibraryOpen(false); setDefinitionsProject(null); setDefinitionSetupPath(null); setDefinitionPromptProject(null); setDefinitionSetupChooserProject(null) }
  const home = () => { void window.omnidesign?.preview.closePopOut(); closePanels(); setActiveDesign(null); setActiveProject(null); setComposerProject(null); void refresh() }
  const openLibrary = () => { void window.omnidesign?.preview.closePopOut(); closePanels(); setActiveDesign(null); setActiveProject(null); setComposerProject(null); setLibraryOpen(true); void refresh() }
  // The "+" on a sidebar project row jumps home with that project pre-filled in the composer target.
  const startDesignInProject = (project: ProjectSummary) => { void window.omnidesign?.preview.closePopOut(); closePanels(); setActiveDesign(null); setActiveProject(null); setComposerProject(project) }
  const openSettings = () => { void window.omnidesign?.preview.closePopOut(); closePanels(); setActiveDesign(null); setActiveProject(null); setSettingsOpen(true) }
  const openProviders = () => { void window.omnidesign?.preview.closePopOut(); closePanels(); setActiveDesign(null); setActiveProject(null); setProvidersOpen(true); providerState.refresh(); localDependencyState.refresh() }
  const openGenerations = () => { void window.omnidesign?.preview.closePopOut(); closePanels(); setActiveDesign(null); setActiveProject(null); setGenerationsOpen(true); void refresh() }
  const openTrash = () => { void window.omnidesign?.preview.closePopOut(); closePanels(); setActiveDesign(null); setActiveProject(null); setTrashOpen(true); void refresh() }
  const openDefinitions = (project: ProjectSummary, setupPath: 'proposal' | 'manual' | null = null) => { void window.omnidesign?.preview.closePopOut(); closePanels(); setDefinitionSetupPath(setupPath); setDefinitionsProject(project) }
  const definitionsSaved = (version: ProjectDesignDefinitionVersion) => {
    setDefinitionsProject((current) => current ? { ...current, currentDefinitionVersion: version.version } : current)
    void refresh()
    if (activeDesign?.projectId === version.projectId && workspaceApi) {
      void workspaceApi.get(activeDesign.id).then((updated) => { if (updated) updateDesign(updated) }).catch((reason: unknown) => setWorkspaceError(reason instanceof Error ? reason.message : 'The design-definition decision could not refresh.'))
    }
  }
  const suppressDefinitionPrompt = async (project: ProjectSummary) => {
    try {
      await workspaceApi?.setProjectDefinitionPromptSuppressed(project.id, true)
      setDefinitionPromptProject(null)
      await refresh()
    } catch (reason) {
      setWorkspaceError(reason instanceof Error && reason.message ? reason.message : 'The definition prompt preference could not be saved.')
    }
  }
  const openDesign = (design: OmniDesignDocument) => {
    closePanels()
    const project = projects.find((candidate) => candidate.id === design.projectId)
    setActiveProject(project && project.kind === 'linked' && project.designCount > 1 ? project : null)
    setActiveDesign(design)
  }
  const openProjectDesign = (project: ProjectSummary, design: OmniDesignDocument) => { closePanels(); setActiveProject(project); setActiveDesign(design) }
  // A project with exactly one design opens straight into its workspace; empty or multi-design projects
  // open the project page (composer plus design grid).
  const openProject = (project: ProjectSummary) => {
    if (project.designCount === 1 && activeDesign?.projectId === project.id) return
    const projectDesigns = designs.filter((design) => design.projectId === project.id)
    setWorkspaceError(null)
    void window.omnidesign?.preview.closePopOut()
    closePanels()
    setActiveProject(project)
    setActiveDesign(projectDesigns.length === 1 ? projectDesigns[0] : null)
  }
  const backFromDesign = () => {
    void window.omnidesign?.preview.closePopOut()
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
  const changeNotifications = async (enabled: boolean) => {
    const previous = notificationsEnabled
    setNotificationsEnabled(enabled)
    try {
      await window.omnidesign?.settings.saveNotificationsEnabled(enabled)
      setSettingsError(null)
    } catch (reason) {
      setNotificationsEnabled(previous)
      throw reason
    }
  }
  const changeGenerationDetail = async (detail: 'full' | 'concise') => {
    const previous = generationDetail
    setGenerationDetail(detail)
    try {
      await window.omnidesign?.settings.saveGenerationDetail(detail)
      setSettingsError(null)
    } catch (reason) {
      setGenerationDetail(previous)
      throw reason
    }
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
    await window.omnidesign?.preview.closePopOut()
    home()
  }
  const trashProject = async (project: ProjectSummary) => {
    const result = await workspaceApi?.trash('project', project.id)
    if (!result || result.cancelled) return
    home()
  }
  const associateDesign = async (design: OmniDesignDocument, projectId: string) => {
    const associated = await workspaceApi?.associateDesign(design.id, projectId)
    // The move persists an "adapt to project?" decision on the design itself, so the notice is driven
    // by associated.adaptationPending — no ephemeral state to set here. Clear any suggested hint.
    if (associated) updateDesign(associated)
    setAssociationNotice(null)
    await refresh()
  }
  const dismissAdaptation = async (design: OmniDesignDocument) => {
    const updated = await workspaceApi?.dismissAdaptation(design.id)
    if (updated) updateDesign(updated)
  }
  const associateAndRestart = async (design: OmniDesignDocument, projectId: string) => {
    const restarted = await workspaceApi?.associateAndRestart(design.id, projectId)
    if (restarted) updateDesign(restarted)
    setAssociationNotice(null)
    await refresh()
  }
  const createFolder = async (name: string, parentFolderId: string | null) => { await workspaceApi?.createFolder(name, parentFolderId); await refresh() }
  const renameFolder = async (folderId: string, name: string) => { await workspaceApi?.renameFolder(folderId, name); await refresh() }
  const deleteFolder = async (folderId: string) => { await workspaceApi?.deleteFolder(folderId); await refresh() }
  const moveProjectToFolder = async (projectId: string, folderId: string | null) => { await workspaceApi?.moveProjectToFolder(projectId, folderId); await refresh() }
  const createLibraryTag = async (name: string): Promise<Tag | null> => {
    const tag = await workspaceApi?.createTag(name, 'neutral') ?? null
    await refresh()
    return tag
  }
  const deleteLibraryTag = async (tagId: string) => { await workspaceApi?.deleteTag(tagId); await refresh() }
  const toggleLibraryTag = async (targetKind: 'project' | 'design', targetId: string, tag: Tag, next: boolean) => {
    if (next) await workspaceApi?.tag(targetKind, targetId, tag.id)
    else await workspaceApi?.untag(targetKind, targetId, tag.id)
    await refresh()
  }
  const duplicateDesign = async (design: OmniDesignDocument) => {
    const created = await workspaceApi?.duplicateDesign(design.id)
    await refresh()
    if (created) openDesign(created)
  }
  const moveDesign = async (design: OmniDesignDocument, projectId: string) => {
    const moved = await workspaceApi?.associateDesign(design.id, projectId)
    if (moved) updateDesign(moved)
    await refresh()
  }
  const activeGenerationCount = designs.flatMap((design) => design.generationJobs).filter((job) => job.state === 'running').length

  return (
    <div className="app-frame">
      <Sidebar projects={projects} designs={designs} activeProjectId={activeProject?.id ?? null} activeDesignId={activeDesign?.id ?? null} activeGenerationCount={activeGenerationCount} workspaceError={workspaceError} homeActive={!activeDesign && !activeProject && !settingsOpen && !providersOpen && !generationsOpen && !trashOpen && !libraryOpen && !definitionsProject} libraryOpen={libraryOpen} settingsOpen={settingsOpen} providersOpen={providersOpen} generationsOpen={generationsOpen} trashOpen={trashOpen} onHome={home} onLibrary={openLibrary} onOpen={openProject} onOpenDesign={openProjectDesign} onAddDesign={startDesignInProject} onSettings={openSettings} onProviders={openProviders} onGenerations={openGenerations} onTrash={openTrash} onRetryWorkspace={() => void refresh()} />
      {libraryOpen
        ? <Library projects={projects} designs={designs} folders={folders} tags={tags} onOpenProject={openProject} onOpenDesign={openDesign} onCreateFolder={createFolder} onRenameFolder={renameFolder} onDeleteFolder={deleteFolder} onMoveProjectToFolder={moveProjectToFolder} onCreateTag={createLibraryTag} onDeleteTag={deleteLibraryTag} onToggleTag={toggleLibraryTag} onDuplicateDesign={duplicateDesign} onMoveDesign={moveDesign} onTrashDesign={trashDesign} />
        : generationsOpen
        ? <Generations designs={designs} onOpen={openDesign} onCancel={cancelGeneration} onRemove={removeGeneration} onResume={resumeGenerationQueue} />
        : trashOpen
        ? <Trash items={trashItems} onRestore={restoreTrash} onPurge={purgeTrash} onEmpty={emptyTrash} />
        : providersOpen
        ? <Providers providers={providerState.providers} loading={providerState.loading} error={providerState.error} dependencies={localDependencyState.dependencies} dependenciesLoading={localDependencyState.loading} dependenciesError={localDependencyState.error} platform={window.omnidesign.environment.platform} onRefresh={() => { providerState.refresh(); localDependencyState.refresh() }} onOpenSetup={window.omnidesign.providers.openSetup} onOpenDependencySetup={window.omnidesign.environment.openSetup} />
        : settingsOpen
        ? <Settings theme={theme} notificationsEnabled={notificationsEnabled} generationDetail={generationDetail} initialError={settingsError} onThemeChange={changeTheme} onNotificationsChange={changeNotifications} onGenerationDetailChange={changeGenerationDetail} />
        : definitionsProject
        ? <DesignDefinitions project={definitionsProject} providers={providerState.providers} initialSetupPath={definitionSetupPath} onBack={() => { setDefinitionsProject(null); setDefinitionSetupPath(null) }} onSaved={definitionsSaved} />
        : activeDesign
        ? <DesignWorkspace key={activeDesign.id} design={activeDesign} providers={providerState.providers} providersLoading={providerState.loading} projects={projects} associationNotice={activeDesign.adaptationPending ? { projectId: activeDesign.projectId, projectName: activeDesign.projectName, mode: 'associated' } : associationNotice?.designId === activeDesign.id ? associationNotice : null} activity={activitiesByDesign[activeDesign.id] ?? null} busy={activeDesign.generationJobs.some((job) => job.state === 'queued' || job.state === 'running')} detailLevel={generationDetail} onBack={backFromDesign} onChange={updateDesign} onRename={renameDesign} onTrash={trashDesign} onAssociate={associateDesign} onAssociateAndRestart={associateAndRestart} onDismissAssociation={() => { setAssociationNotice(null); void dismissAdaptation(activeDesign) }} onOpenProviders={openProviders} onOpenDefinitions={() => { const project = projects.find((candidate) => candidate.id === activeDesign.projectId); if (project) openDefinitions(project) }} />
        : activeProject
        ? <ProjectPage project={activeProject} projects={projects} designs={designs} providers={providerState.providers} providersLoading={providerState.loading} busy={creating} activity={null} onCreate={create} onOpenDesign={openDesign} onRenameProject={renameProject} onDesignRenamed={(renamed) => { updateDesign(renamed); void refresh() }} onReconnect={reconnectProject} onConvertToStandalone={convertProjectToStandalone} onTrashProject={trashProject} onRefresh={async () => { await refresh() }} onOpenProviders={openProviders} onOpenDefinitions={() => openDefinitions(activeProject)} />
        : <Home projects={projects} designs={designs} providers={providerState.providers} providersLoading={providerState.loading} busy={creating} activity={null} composerProject={composerProject} onCreate={create} onOpenDesign={openDesign} onOpenProviders={openProviders} />}
      <AppModal isOpen={definitionPromptProject !== null} onOpenChange={(open) => { if (!open) setDefinitionPromptProject(null) }} className="definition-setup-modal" title={`Set up design definitions for ${definitionPromptProject?.name ?? 'this project'}?`}>
        {(close) => <>
          <div className="definition-setup-intro">
            <span className="definition-setup-symbol"><SwatchIcon aria-hidden="true" /></span>
            <p>Give every design in this project shared colors, typography, spacing, shape, and agent guidance. You can change these definitions later.</p>
          </div>
          <div className="definition-setup-footer">
            <Button className="text-button definition-setup-dismiss" onPress={() => { const project = definitionPromptProject; if (project) void suppressDefinitionPrompt(project) }}>Don't show again for this project</Button>
            <span className="definition-setup-confirmation">
              <Button className="secondary-action" onPress={close}>Not now</Button>
              <Button className="primary-action" onPress={() => { const project = definitionPromptProject; close(); if (project) setDefinitionSetupChooserProject(project) }}>Set up now</Button>
            </span>
          </div>
        </>}
      </AppModal>
      <AppModal isOpen={definitionSetupChooserProject !== null} onOpenChange={(open) => { if (!open) setDefinitionSetupChooserProject(null) }} className="definition-setup-modal" title={`Choose how to set up ${definitionSetupChooserProject?.name ?? 'this project'}`}>
        {(close) => <>
          <p className="definition-setup-copy">Nothing is saved until you review the definitions and choose Save.</p>
          <div className="definition-setup-options">
            <Button className="definition-setup-option" aria-label="Generate a proposal" onPress={() => { const project = definitionSetupChooserProject; close(); if (project) openDefinitions(project, 'proposal') }}>
              <span className="definition-setup-option-icon"><SparklesIcon aria-hidden="true" /></span>
              <span><strong>Generate a proposal</strong><small>Let an installed AI inspect the project and prepare an editable starting point.</small></span>
              <ArrowRightIcon aria-hidden="true" />
            </Button>
            <Button className="definition-setup-option" aria-label="Fill in manually" onPress={() => { const project = definitionSetupChooserProject; close(); if (project) openDefinitions(project, 'manual') }}>
              <span className="definition-setup-option-icon"><PencilSquareIcon aria-hidden="true" /></span>
              <span><strong>Fill in manually</strong><small>Start with empty sections and define the project system yourself.</small></span>
              <ArrowRightIcon aria-hidden="true" />
            </Button>
          </div>
          <Button className="text-button definition-setup-skip" onPress={close}>Continue without definitions</Button>
        </>}
      </AppModal>
    </div>
  )
}
