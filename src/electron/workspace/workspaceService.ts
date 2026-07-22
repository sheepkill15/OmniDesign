import { compileTailwindCss, validateCompiledDesign } from './compiler.js'
import type { Attachment, Design, GenerationActivity, GenerationSelection, Layout, ProjectSummary, Theme, TrashItem } from './contracts.js'
import { DesignRepositoryManager } from './designRepository.js'
import type { RevisionFiles } from './designRepository.js'
import { generateMockDesign } from './mockGenerator.js'
import { WorkspaceStore } from './store.js'
import { cloneRepository } from './gitClone.js'

type ActivityListener = (activity: GenerationActivity) => void

/** Where a new design should live: an existing project, a linked source folder, or a fresh standalone project. */
export interface CreateDesignTarget {
  readonly projectId?: string | null
  readonly sourceProjectPath?: string | null
}

export class WorkspaceService {
  private readonly repositories: DesignRepositoryManager

  public constructor(private readonly store: WorkspaceStore) {
    this.repositories = new DesignRepositoryManager(store.getDesignArtifactsDirectory())
  }

  public listDesigns(): Design[] {
    return this.store.listDesigns()
  }

  public listProjects(): ProjectSummary[] {
    return this.store.listProjects()
  }

  public getProject(projectId: string): { readonly project: ProjectSummary; readonly designs: Design[] } | null {
    const project = this.store.getProjectSummary(projectId)
    if (!project) return null
    return { project, designs: this.store.listDesignsByProject(projectId) }
  }

  public getDesign(designId: string): Design | null {
    return this.store.getDesign(designId)
  }
  public associateDesignWithProject(designId: string, projectId: string): Design { return this.store.associateDesignWithProject(designId, projectId) }

  public listTrash(): TrashItem[] { return this.store.listTrash() }
  public registerLinkedProject(sourceProjectPath: string): ProjectSummary { return this.store.registerLinkedProject(sourceProjectPath) }
  public async cloneProject(remoteUrl: string, destinationDirectory: string, onActivity: (detail: string) => void): Promise<ProjectSummary> {
    const sourceProjectPath = await cloneRepository(remoteUrl, destinationDirectory, (activity) => onActivity(activity.detail))
    return this.store.registerLinkedProject(sourceProjectPath)
  }
  public reconnectProject(projectId: string, sourceProjectPath: string): ProjectSummary { return this.store.reconnectProject(projectId, sourceProjectPath) }
  public convertProjectToStandalone(projectId: string): ProjectSummary { return this.store.convertProjectToStandalone(projectId) }
  public moveProjectToTrash(projectId: string): void { this.store.moveProjectToTrash(projectId) }
  public moveDesignToTrash(designId: string): void { this.store.moveDesignToTrash(designId) }
  public restoreTrashItem(kind: 'project' | 'design', id: string): ProjectSummary | Design { return kind === 'project' ? this.store.restoreProject(id) : this.store.restoreDesign(id) }
  public purgeTrashItem(kind: 'project' | 'design', id: string): void { this.store.purgeTrashItem(kind, id) }

  private createDesignRecord(prompt: string, title: string, target: CreateDesignTarget | undefined, attachments: readonly Attachment[] = []): Design {
    if (target?.projectId) return this.store.createDesignInProject(target.projectId, prompt, title, attachments)
    if (target?.sourceProjectPath) return this.store.createLinkedDesign(prompt, title, target.sourceProjectPath, attachments)
    return this.store.createStandaloneDesign(prompt, title, attachments)
  }

  public getDesignRepositoryPath(designId: string): string {
    if (!this.store.getDesign(designId)) throw new Error('Design not found.')
    return this.repositories.getPath(designId)
  }

  public async createDesign(prompt: string, onActivity: ActivityListener, target?: CreateDesignTarget, attachments: readonly Attachment[] = []): Promise<Design> {
    const generated = generateMockDesign(prompt)
    const design = this.createDesignRecord(prompt, generated.title, target, attachments)
    onActivity({ designId: design.id, stage: 'queued', detail: 'Setting up design repository…' })
    this.repositories.initialize(design.id)
    return this.generate(design.id, prompt, onActivity, generated.html, false)
  }

  public createAgentDesignShell(prompt: string, onActivity: ActivityListener, target?: CreateDesignTarget, title = generateMockDesign(prompt).title): Design {
    const design = this.createDesignRecord('', title, target)
    onActivity({ designId: design.id, stage: 'queued', detail: 'Setting up design repository…' })
    this.repositories.initialize(design.id)
    return design
  }

  public async generate(designId: string, prompt: string, onActivity: ActivityListener, generatedHtml?: string, savePrompt = true, signal?: AbortSignal, maxRepairAttempts = 0): Promise<Design> {
    this.throwIfCancelled(signal)
    if (savePrompt) this.store.addPrompt(designId, prompt)
    onActivity({ designId, stage: 'generating', detail: 'Mock provider is shaping the requested direction.' })
    const current = this.store.getDesign(designId)
    if (!current) throw new Error('Design not found.')
    const isIteration = current.activeRevisionId ?? undefined
    let candidate = generatedHtml ?? generateMockDesign(prompt, isIteration).html

    for (let repairAttempt = 0; repairAttempt <= maxRepairAttempts; repairAttempt += 1) {
      try {
        this.throwIfCancelled(signal)
        onActivity({ designId, stage: 'compiling', detail: 'Compiling the generated Tailwind classes.' })
        const tailwindCss = await compileTailwindCss(candidate)
        this.throwIfCancelled(signal)
        onActivity({ designId, stage: 'validating', detail: 'Checking document structure and preview security.' })
        validateCompiledDesign(candidate)
        onActivity({ designId, stage: 'saving', detail: 'Committing the revision to the design repository.' })
        const gitCommit = this.repositories.commitRevision(designId, candidate, tailwindCss, `Apply design revision: ${prompt}`)
        const saved = this.store.addRevision(designId, prompt, 'mock', 'mock-v1', gitCommit)
        onActivity({ designId, stage: 'complete', detail: 'Revision is ready to preview.' })
        return saved
      } catch (error) {
        if (signal?.aborted) return this.cancelledDesign(designId, onActivity)
        const diagnostic = error instanceof Error ? error.message : 'Generation failed.'
        if (repairAttempt === maxRepairAttempts) {
          const rejected = this.store.addInvalidCandidate(designId, prompt, candidate, diagnostic)
          onActivity({ designId, stage: 'failed', detail: diagnostic })
          return rejected
        }
        onActivity({ designId, stage: 'repairing', detail: `Repairing the candidate (${repairAttempt + 1} of ${maxRepairAttempts}).` })
        candidate = generateMockDesign(`Repair this design without unsafe code or external resources: ${diagnostic}`, isIteration).html
      }
    }

    throw new Error('Generation repair loop ended unexpectedly.')
  }

  public selectRevision(designId: string, revisionId: string): Design {
    const design = this.store.getDesign(designId)
    const revision = design?.revisions.find((candidate) => candidate.id === revisionId)
    if (!design || !revision) throw new Error('Revision not found.')
    // Going back to a revision checks its commit out into the working tree; selecting the current
    // head returns to the main timeline. Legacy revisions without a commit are viewed without checkout.
    if (revision.id === design.activeRevisionId) this.repositories.checkoutMain(designId)
    else if (revision.gitCommit) this.repositories.checkoutRevision(designId, revision.gitCommit)
    return this.store.selectRevision(designId, revisionId)
  }

  /** Ensure the working tree is at the head of the main timeline before a new generation runs. */
  public prepareGenerationWorkspace(designId: string): void {
    this.repositories.checkoutMain(designId)
  }

  public restoreRevision(designId: string, revisionId: string): Design {
    const design = this.store.getDesign(designId)
    const revision = design?.revisions.find((candidate) => candidate.id === revisionId)
    if (!revision) throw new Error('Revision not found.')
    if (!revision.gitCommit) throw new Error('Revision has no committed content to restore.')
    const gitCommit = this.repositories.restore(designId, revision.gitCommit, `Restore design revision: ${revision.prompt}`)
    return this.store.restoreRevision(designId, revisionId, gitCommit)
  }

  /** Read a revision's committed files (entry page + build assets) for preview and export. */
  public getRevisionFiles(designId: string, revisionId: string): RevisionFiles {
    const design = this.store.getDesign(designId)
    const revision = design?.revisions.find((candidate) => candidate.id === revisionId)
    if (!revision) throw new Error('Revision not found.')
    if (!revision.gitCommit) throw new Error('Revision has no committed content.')
    return this.repositories.readRevisionFiles(designId, revision.gitCommit)
  }

  public async saveAgentWorkspaceResult(
    designId: string,
    prompt: string,
    providerId: string,
    modelId: string,
    response: string,
    onActivity: ActivityListener,
  ): Promise<Design> {
    const current = this.store.getDesign(designId)
    if (!current) throw new Error('Design not found.')

    try {
      const indexHtml = this.repositories.readIndexHtml(designId)
      onActivity({ designId, stage: 'compiling', detail: 'Compiling the agent workspace entry page.' })
      const tailwindCss = await compileTailwindCss(indexHtml)
      onActivity({ designId, stage: 'validating', detail: 'Checking the agent workspace result.' })
      validateCompiledDesign(indexHtml)
      onActivity({ designId, stage: 'saving', detail: 'Committing the agent revision to the design repository.' })
      const gitCommit = this.repositories.commitRevision(designId, null, tailwindCss, `Apply agent result: ${prompt}`)
      if (gitCommit === null) {
        onActivity({ designId, stage: 'complete', detail: 'No changes to save; recorded the response.' })
        return this.store.addAssistantResponse(designId, response)
      }
      const saved = this.store.addRevision(designId, prompt, providerId, modelId, gitCommit, response)
      onActivity({ designId, stage: 'complete', detail: 'Agent result is ready to preview.' })
      return saved
    } catch (error) {
      const diagnostic = error instanceof Error ? error.message : 'Agent result validation failed.'
      const rejected = this.store.addInvalidCandidate(designId, prompt, this.repositories.readIndexHtml(designId), diagnostic)
      this.store.addAssistantResponse(designId, response)
      onActivity({ designId, stage: 'failed', detail: diagnostic })
      return rejected
    }
  }

  public saveDraft(designId: string, draft: string, attachments: readonly import('./contracts.js').Attachment[] = []): void {
    this.store.saveDraft(designId, draft, attachments)
  }

  public recordAgentResponse(designId: string, response: string): Design {
    return this.store.addAssistantResponse(designId, response)
  }

  public saveLayout(designId: string, layout: Layout): void {
    this.store.saveLayout(designId, layout)
  }

  public getTheme(): Theme {
    return this.store.getTheme()
  }

  public saveTheme(theme: Theme): void {
    this.store.saveTheme(theme)
  }

  public getNotificationsEnabled(): boolean { return this.store.getNotificationsEnabled() }
  public saveNotificationsEnabled(enabled: boolean): void { this.store.saveNotificationsEnabled(enabled) }
  public getGenerationDetail(): 'full' | 'concise' { return this.store.getGenerationDetail() }
  public saveGenerationDetail(detail: 'full' | 'concise'): void { this.store.saveGenerationDetail(detail) }

  public getGenerationDefaults(): GenerationSelection {
    return this.store.getGenerationDefaults()
  }

  public saveGenerationDefaults(selection: GenerationSelection): void {
    this.store.saveGenerationDefaults(selection)
  }

  public saveDesignSelection(designId: string, selection: GenerationSelection): void {
    this.store.saveDesignSelection(designId, selection)
  }

  /** Persist a design's most-recent generation selection and update the global default in one step. */
  public rememberSelection(designId: string, selection: GenerationSelection): void {
    this.store.saveDesignSelection(designId, selection)
    this.store.saveGenerationDefaults(selection)
  }

  private throwIfCancelled(signal: AbortSignal | undefined): void {
    if (signal?.aborted) throw new Error('Generation was cancelled.')
  }

  private cancelledDesign(designId: string, onActivity: ActivityListener): Design {
    onActivity({ designId, stage: 'cancelled', detail: 'Generation was cancelled.' })
    const design = this.store.getDesign(designId)
    if (!design) throw new Error('Design not found.')
    return design
  }
}
