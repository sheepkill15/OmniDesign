import { compileTailwindCssForFiles, validateDesignFiles } from './compiler.js'
import type { Attachment, Design, DesignPage, Folder, GenerationActivity, GenerationSelection, Layout, ProjectDesignDefinitions, ProjectDesignDefinitionState, ProjectDesignDefinitionVersion, ProjectSummary, RevisionComparison, RevisionPages, Tag, TagColor, Theme, TrashItem } from './contracts.js'
import { DesignRepositoryManager } from './designRepository.js'
import type { RevisionFiles } from './designRepository.js'
import { discoverPages, extractPageTitle, resolveEntryPage } from './pages.js'
import { generateMockDesign } from './mockGenerator.js'
import { WorkspaceStore } from './store.js'
import { cloneRepository } from './gitClone.js'
import { canUpdateProjectThemeDeterministically, createProjectDefinitionApplicationPrompt, createProjectDefinitionPromptContext, materializeProjectTheme } from './projectTheme.js'

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
  public renameProject(projectId: string, name: string): ProjectSummary { return this.store.renameProject(projectId, name) }
  public getProjectDesignDefinitionState(projectId: string): ProjectDesignDefinitionState | null { return this.store.getProjectDesignDefinitionState(projectId) }
  public listProjectDesignDefinitionVersions(projectId: string): ProjectDesignDefinitionVersion[] { return this.store.listProjectDesignDefinitionVersions(projectId) }
  public saveProjectDesignDefinitions(projectId: string, definitions: ProjectDesignDefinitions): ProjectDesignDefinitionVersion { return this.store.saveProjectDesignDefinitions(projectId, definitions) }
  public setProjectDefinitionPromptSuppressed(projectId: string, suppressed: boolean): ProjectDesignDefinitionState { return this.store.setProjectDefinitionPromptSuppressed(projectId, suppressed) }
  public keepProjectDesignDefinitions(designId: string, targetVersion: number): Design { return this.store.keepProjectDesignDefinitions(designId, targetVersion) }

  public async applyProjectDesignDefinitions(designId: string, targetVersion: number): Promise<Design> {
    const design = this.store.getDesign(designId)
    if (!design || design.pendingDefinitionVersion !== targetVersion) throw new Error('The requested project-definition decision is no longer pending.')
    const target = this.store.listProjectDesignDefinitionVersions(design.projectId).find((candidate) => candidate.version === targetVersion)
    if (!target) throw new Error('The requested project definitions are missing.')
    const current = design.definitionVersion
      ? this.store.listProjectDesignDefinitionVersions(design.projectId).find((candidate) => candidate.version === design.definitionVersion) ?? null
      : null
    if (design.activeRevisionId && (!current || !canUpdateProjectThemeDeterministically(current.definitions, target.definitions))) {
      const diagnostic = 'This change needs AI interpretation. Choose an available provider to apply it.'
      this.store.startProjectDefinitionApplicationAttempt(designId, targetVersion, { mechanism: 'ai', state: 'unavailable', diagnostic })
      return this.store.failProjectDefinitionApplication(designId, targetVersion, diagnostic, true)
    }
    const attempt = this.store.startProjectDefinitionApplicationAttempt(designId, targetVersion, { mechanism: 'deterministic' })
    if (design.generationJobs.some((job) => job.state === 'queued' || job.state === 'running')) {
      const diagnostic = 'Finish or stop the design’s active work before applying project definitions.'
      this.store.finishProjectDefinitionApplicationAttempt(attempt.id, 'failed', diagnostic)
      return this.store.failProjectDefinitionApplication(designId, targetVersion, diagnostic)
    }

    this.store.beginProjectDefinitionApplication(designId, targetVersion)
    try {
      this.repositories.checkoutMain(designId)
      const sourceFiles = materializeProjectTheme(this.repositories.readWorkingTreeFiles(designId), target)
      this.repositories.writeSourceFiles(designId, sourceFiles)
      if (!design.activeRevisionId) {
        const completed = this.store.completeProjectDefinitionApplication(designId, targetVersion)
        this.store.finishProjectDefinitionApplicationAttempt(attempt.id, 'completed')
        return completed
      }
      const tailwindCss = await compileTailwindCssForFiles(sourceFiles)
      validateDesignFiles(sourceFiles)
      const gitCommit = this.repositories.commitRevision(designId, null, tailwindCss, `Apply project definitions version ${targetVersion}`)
      const revised = gitCommit ? this.store.addRevision(designId, `Apply project definitions version ${targetVersion}`, 'omnidesign', 'deterministic', gitCommit, `Applied project definitions version ${targetVersion}.`, targetVersion) : null
      const completed = this.store.completeProjectDefinitionApplication(designId, targetVersion)
      this.store.finishProjectDefinitionApplicationAttempt(attempt.id, 'completed', null, revised?.activeRevisionId ?? null)
      return completed
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Project definitions could not be applied.'
      this.store.failProjectDefinitionApplication(designId, targetVersion, message)
      this.store.finishProjectDefinitionApplicationAttempt(attempt.id, 'failed', message)
      throw error
    }
  }

  public async applyProjectDesignDefinitionsToAll(projectId: string, targetVersion: number): Promise<Design[]> {
    const pending = this.store.listDesignsByProject(projectId).filter((design) => design.pendingDefinitionVersion === targetVersion)
    const results: Design[] = []
    for (const design of pending) {
      try { results.push(await this.applyProjectDesignDefinitions(design.id, targetVersion)) }
      catch { const failed = this.store.getDesign(design.id); if (failed) results.push(failed) }
    }
    return results
  }

  public prepareAIProjectDefinitionApplication(designId: string, targetVersion: number): string {
    const design = this.store.getDesign(designId)
    if (!design || design.pendingDefinitionVersion !== targetVersion) throw new Error('The requested project-definition decision is no longer pending.')
    const versions = this.store.listProjectDesignDefinitionVersions(design.projectId)
    const target = versions.find((candidate) => candidate.version === targetVersion)
    if (!target) throw new Error('The requested project definitions are missing.')
    const current = design.definitionVersion ? versions.find((candidate) => candidate.version === design.definitionVersion) ?? null : null
    this.store.beginProjectDefinitionApplication(designId, targetVersion)
    return createProjectDefinitionApplicationPrompt(current, target)
  }
  public renameDesign(designId: string, title: string): Design { return this.store.renameDesign(designId, title) }
  public setTitlePending(designId: string, pending: boolean): void { this.store.setTitlePending(designId, pending) }
  public setAdaptationPending(designId: string, pending: boolean): void { this.store.setAdaptationPending(designId, pending) }
  public associateDesignWithProject(designId: string, projectId: string): Design { return this.store.associateDesignWithProject(designId, projectId) }

  /** Duplicate a design (head revision + metadata) and clone its Git repository into the copy. */
  public duplicateDesign(designId: string): Design {
    const source = this.store.getDesign(designId)
    if (!source) throw new Error('Design not found.')
    const duplicate = this.store.duplicateDesign(designId, `${source.title} copy`)
    try {
      this.repositories.duplicateRepository(designId, duplicate.id)
    } catch (error) {
      // If the repository could not be cloned the duplicate cannot preview or export, so remove it
      // rather than leaving a broken design behind.
      try {
        this.store.moveDesignToTrash(duplicate.id)
        this.store.purgeTrashItem('design', duplicate.id)
      } catch { /* best-effort cleanup */ }
      throw error
    }
    return this.store.getDesign(duplicate.id) ?? duplicate
  }

  public listFolders(): Folder[] { return this.store.listFolders() }
  public createFolder(name: string, parentFolderId: string | null = null): Folder { return this.store.createFolder(name, parentFolderId) }
  public renameFolder(folderId: string, name: string): Folder { return this.store.renameFolder(folderId, name) }
  public deleteFolder(folderId: string): void { this.store.deleteFolder(folderId) }
  public moveProjectToFolder(projectId: string, folderId: string | null): ProjectSummary { return this.store.moveProjectToFolder(projectId, folderId) }
  public listTags(): Tag[] { return this.store.listTags() }
  public createTag(name: string, color: TagColor): Tag { return this.store.createTag(name, color) }
  public deleteTag(tagId: string): void { this.store.deleteTag(tagId) }
  public setTag(kind: 'project' | 'design', targetId: string, tagId: string): void { this.store.setTag(kind, targetId, tagId) }
  public removeTag(kind: 'project' | 'design', targetId: string, tagId: string): void { this.store.removeTag(kind, targetId, tagId) }

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
    onActivity({ designId: design.id, stage: 'queued', detail: 'Setting up your design…' })
    this.repositories.initialize(design.id)
    return this.generate(design.id, prompt, onActivity, generated.html, false, undefined, 0, generated.files)
  }

  public createAgentDesignShell(prompt: string, onActivity: ActivityListener, target?: CreateDesignTarget, title = generateMockDesign(prompt).title): Design {
    const design = this.createDesignRecord('', title, target)
    onActivity({ designId: design.id, stage: 'queued', detail: 'Setting up your design…' })
    this.repositories.initialize(design.id)
    const definitionVersion = this.definitionVersionForDesign(design)
    if (definitionVersion) {
      const files = materializeProjectTheme(this.repositories.readWorkingTreeFiles(design.id), definitionVersion)
      this.repositories.writeSourceFiles(design.id, files)
    }
    return design
  }

  public getInitialProjectDefinitionPromptContext(designId: string): string {
    const design = this.store.getDesign(designId)
    if (!design || design.activeRevisionId) return ''
    const definitionVersion = this.definitionVersionForDesign(design)
    return definitionVersion ? createProjectDefinitionPromptContext(definitionVersion) : ''
  }

  public async generate(designId: string, prompt: string, onActivity: ActivityListener, generatedHtml?: string, savePrompt = true, signal?: AbortSignal, maxRepairAttempts = 0, generatedFiles?: RevisionFiles): Promise<Design> {
    this.throwIfCancelled(signal)
    if (savePrompt) this.store.addPrompt(designId, prompt)
    onActivity({ designId, stage: 'generating', detail: 'Mock provider is shaping the requested direction.' })
    const current = this.store.getDesign(designId)
    if (!current) throw new Error('Design not found.')
    const isIteration = current.activeRevisionId ?? undefined
    let generated = generatedFiles ? { html: generatedHtml ?? generatedFiles['index.html'] ?? '', files: generatedFiles } : generateMockDesign(prompt, isIteration)
    if (generatedHtml && !generatedFiles) generated = { html: generatedHtml, files: { 'index.html': generatedHtml } }
    const definitionVersion = current.activeRevisionId ? null : this.definitionVersionForDesign(current)
    if (definitionVersion) {
      const files = materializeProjectTheme(generated.files, definitionVersion)
      generated = { html: files['index.html'] ?? generated.html, files }
    }

    for (let repairAttempt = 0; repairAttempt <= maxRepairAttempts; repairAttempt += 1) {
      try {
        this.throwIfCancelled(signal)
        onActivity({ designId, stage: 'compiling', detail: 'Compiling the generated Tailwind classes.' })
        const tailwindCss = await compileTailwindCssForFiles(generated.files)
        this.throwIfCancelled(signal)
        onActivity({ designId, stage: 'validating', detail: 'Checking the design.' })
        validateDesignFiles(generated.files)
        onActivity({ designId, stage: 'saving', detail: 'Committing the revision to the design repository.' })
        const gitCommit = this.repositories.commitGeneratedRevision(designId, generated.files, tailwindCss, `Apply design revision: ${prompt}`)
        const saved = this.store.addRevision(designId, prompt, 'mock', 'mock-v1', gitCommit)
        onActivity({ designId, stage: 'complete', detail: 'Revision is ready to preview.' })
        return saved
      } catch (error) {
        if (signal?.aborted) return this.cancelledDesign(designId, onActivity)
        const diagnostic = error instanceof Error ? error.message : 'Generation failed.'
        if (repairAttempt === maxRepairAttempts) {
          const rejected = this.store.addInvalidCandidate(designId, prompt, generated.html, diagnostic, 'OmniDesign couldn’t finish this design after a few tries. Review the notes below, then Continue or Retry.')
          onActivity({ designId, stage: 'failed', detail: 'Couldn’t finish the design after a few tries.' })
          return rejected
        }
        onActivity({ designId, stage: 'repairing', detail: 'Making a few improvements…' })
        generated = generateMockDesign(`Repair this design without unsafe code or external resources: ${diagnostic}`, isIteration)
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

  /** Read a revision's committed files (all pages + shared build assets) for preview and export. */
  public getRevisionFiles(designId: string, revisionId: string): RevisionFiles {
    const design = this.store.getDesign(designId)
    const revision = design?.revisions.find((candidate) => candidate.id === revisionId)
    if (!revision) throw new Error('Revision not found.')
    if (!revision.gitCommit) throw new Error('Revision has no committed content.')
    return this.repositories.readRevisionFiles(designId, revision.gitCommit)
  }

  public compareRevisions(designId: string, baseRevisionId: string, targetRevisionId: string): RevisionComparison {
    const design = this.store.getDesign(designId)
    const base = design?.revisions.find((revision) => revision.id === baseRevisionId)
    const target = design?.revisions.find((revision) => revision.id === targetRevisionId)
    if (!base || !target) throw new Error('Revision not found.')
    if (!base.gitCommit || !target.gitCommit) throw new Error('Revision comparison is unavailable for legacy revisions.')
    return this.repositories.compareRevisions(designId, base.gitCommit, target.gitCommit, baseRevisionId, targetRevisionId)
  }

  /**
   * Discover a revision's pages from its committed files and resolve which one is the home page,
   * merging any persisted per-path metadata (display title, order, home override) the design carries.
   */
  public getRevisionPages(designId: string, revisionId: string): RevisionPages {
    const design = this.store.getDesign(designId)
    if (!design) throw new Error('Design not found.')
    const files = this.getRevisionFiles(designId, revisionId)
    const discovered = discoverPages(files)
    const metadata = new Map(design.pages.map((page) => [page.path, page]))
    const entryPagePath = resolveEntryPage(discovered, design.entryPagePath)
    const pages: DesignPage[] = discovered.map((page, index) => ({
      path: page,
      // A user-set display title wins; otherwise fall back to the page's own <title>, then the path.
      title: metadata.get(page)?.title ?? extractPageTitle(files[page] ?? '') ?? null,
      order: metadata.get(page)?.order ?? index,
      isHome: page === entryPagePath,
    }))
    pages.sort((a, b) => a.order - b.order)
    return { pages, entryPagePath }
  }

  public async saveAgentWorkspaceResult(
    designId: string,
    prompt: string,
    providerId: string,
    modelId: string,
    response: string,
    onActivity: ActivityListener,
    allowRepair = false,
    definitionTargetVersion: number | null = null,
  ): Promise<Design> {
    const current = this.store.getDesign(designId)
    if (!current) throw new Error('Design not found.')

    try {
      let sourceFiles = this.repositories.readWorkingTreeFiles(designId)
      const definitionVersion = definitionTargetVersion
        ? this.store.listProjectDesignDefinitionVersions(current.projectId).find((candidate) => candidate.version === definitionTargetVersion) ?? null
        : current.activeRevisionId ? null : this.definitionVersionForDesign(current)
      if (definitionTargetVersion && !definitionVersion) throw new Error('The requested project definitions are missing.')
      if (definitionVersion) {
        sourceFiles = materializeProjectTheme(sourceFiles, definitionVersion)
        this.repositories.writeSourceFiles(designId, sourceFiles)
      }
      onActivity({ designId, stage: 'compiling', detail: 'Preparing the design’s styles.' })
      const tailwindCss = await compileTailwindCssForFiles(sourceFiles)
      onActivity({ designId, stage: 'validating', detail: 'Checking the design.' })
      validateDesignFiles(sourceFiles)
      onActivity({ designId, stage: 'saving', detail: 'Saving your design.' })
      const gitCommit = this.repositories.commitRevision(designId, null, tailwindCss, `Apply agent result: ${prompt}`)
      if (gitCommit === null) {
        onActivity({ designId, stage: 'complete', detail: 'No changes were needed.' })
        return this.store.addAssistantResponse(designId, response)
      }
      const saved = this.store.addRevision(designId, prompt, providerId, modelId, gitCommit, response, definitionTargetVersion ?? current.definitionVersion ?? null)
      onActivity({ designId, stage: 'complete', detail: 'Your design is ready.' })
      return saved
    } catch (error) {
      const diagnostic = error instanceof Error ? error.message : 'Agent result validation failed.'
      // Intermediate failures inside a repair loop are recorded for diagnostics but stay out of the
      // conversation: only a final, unrecoverable failure posts a system message and the agent's reply,
      // so a design that is fixed on a later attempt shows no leftover rejection.
      if (allowRepair) {
        const rejected = this.store.addInvalidCandidate(designId, prompt, this.readEntryPageForDiagnostics(designId), diagnostic)
        onActivity({ designId, stage: 'repairing', detail: 'Making a few improvements…' })
        return rejected
      }
      const rejected = this.store.addInvalidCandidate(designId, prompt, this.readEntryPageForDiagnostics(designId), diagnostic, 'OmniDesign couldn’t finish this design after a few tries. Review the notes below, then Continue or Retry.')
      this.store.addAssistantResponse(designId, response)
      onActivity({ designId, stage: 'failed', detail: 'Couldn’t finish the design after a few tries.' })
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

  public setDesignEntryPage(designId: string, entryPagePath: string | null): Design {
    return this.store.setDesignEntryPage(designId, entryPagePath)
  }

  public saveDesignPageMetadata(designId: string, path: string, title: string | null, order: number): Design {
    return this.store.saveDesignPageMetadata(designId, path, title, order)
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

  public getLastOpenDesignId(): string | null { return this.store.getLastOpenDesignId() }
  public saveLastOpenDesignId(designId: string | null): void { this.store.saveLastOpenDesignId(designId) }

  public saveDesignSelection(designId: string, selection: GenerationSelection): void {
    this.store.saveDesignSelection(designId, selection)
  }

  /** Persist a design's most-recent generation selection and update the global default in one step. */
  public rememberSelection(designId: string, selection: GenerationSelection): void {
    this.store.saveDesignSelection(designId, selection)
    this.store.saveGenerationDefaults(selection)
  }

  // The entry page's current working-tree HTML, for storing a rejected candidate. Falls back to any
  // discovered page, then to index.html, so a design whose home page is not index.html still records.
  private readEntryPageForDiagnostics(designId: string): string {
    const files = this.repositories.readWorkingTreeFiles(designId)
    const entry = resolveEntryPage(discoverPages(files))
    if (entry && files[entry] !== undefined) return files[entry]
    return this.repositories.readIndexHtml(designId)
  }

  private definitionVersionForDesign(design: Design): ProjectDesignDefinitionVersion | null {
    if (!design.definitionVersion) return null
    return this.store.listProjectDesignDefinitionVersions(design.projectId).find((candidate) => candidate.version === design.definitionVersion) ?? null
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
