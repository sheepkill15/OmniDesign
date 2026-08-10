import { compileTailwindCssForFiles, validateDesignFiles } from './compiler.js'
import type { Attachment, BranchComparison, BranchComparisonSummary, BranchContextReference, CombinationAttempt, Design, DesignBranch, DesignPage, Folder, GenerationActivity, GenerationSelection, Layout, ProjectDesignDefinitions, ProjectDesignDefinitionState, ProjectDesignDefinitionVersion, ProjectSummary, ResolvedBranchContext, RevisionComparison, RevisionPages, Tag, TagColor, Theme, TrashItem } from './contracts.js'
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
    for (const design of store.listDesigns()) {
      this.repositories.validateMainWorktree(design.id)
      for (const branch of design.branches.filter((candidate) => !candidate.isMain)) {
        try {
          this.repositories.getWorkingPath(design.id, branch.id)
        } catch {
          try { this.repositories.repairBranchWorktree(design.id, branch.id) }
          catch { this.store.setDesignBranchStatus(design.id, branch.id, 'failed') }
        }
      }
    }
    for (const attempt of store.listActiveCombinationAttempts().filter((candidate) => candidate.state === 'applying')) {
      if (!attempt.destinationBranchId) { store.stopCombinationAttempt(attempt.id, 'failed', 'The destination branch was removed before restart recovery.'); continue }
      try {
        const fallback = this.repositories.beginFallbackMerge(attempt.designId, attempt.destinationBranchId, attempt.destinationCommit, attempt.sourceCommit)
        store.setCombinationManualResolution(attempt.id, fallback.conflicts.length ? `OmniDesign restarted during combination. Resolve conflicts in: ${fallback.conflicts.join(', ')}` : 'OmniDesign restarted during combination. Review the recovered fallback merge before finishing.', null, fallback.clean ? 'automatic_merge' : 'manual_resolution')
      } catch (error) {
        try { this.repositories.restoreBranchToCommit(attempt.designId, attempt.destinationBranchId, attempt.destinationCommit) } catch { /* retain the original recovery failure */ }
        store.stopCombinationAttempt(attempt.id, 'failed', error instanceof Error ? error.message : 'Combination recovery failed.')
      }
    }
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
  public createDesignBranch(designId: string, title: string, baseRevisionId?: string | null, forkMessageId?: string | null): Design {
    const source = this.store.getDesign(designId)
    if (!source) throw new Error('Design not found.')
    const resolvedBaseRevisionId = baseRevisionId === undefined ? source.activeRevisionId : baseRevisionId
    const baseRevision = resolvedBaseRevisionId ? source.revisions.find((revision) => revision.id === resolvedBaseRevisionId) : null
    const baseCommit = baseRevision?.gitCommit ?? (resolvedBaseRevisionId === null ? this.repositories.getInitialCommit(designId) : null)
    if (!baseCommit) throw new Error('A branch requires a committed design revision as its starting point.')
    const branch = this.store.createDesignBranch(designId, title, resolvedBaseRevisionId, forkMessageId ?? null)
    try {
      this.repositories.createBranchWorktree(designId, branch.id, baseCommit)
      return this.switchDesignBranch(designId, branch.id)
    } catch (error) {
      try { this.store.removeDesignBranchRecord(designId, branch.id) } catch { /* preserve the original lifecycle error */ }
      throw error
    }
  }

  public switchDesignBranch(designId: string, branchId: string): Design {
    const branch = this.store.listDesignBranches(designId).find((candidate) => candidate.id === branchId)
    if (!branch) throw new Error('Design branch not found.')
    try {
      if (branch.isMain) this.repositories.validateMainWorktree(designId)
      else {
        try { this.repositories.getWorkingPath(designId, branchId) }
        catch { this.repositories.repairBranchWorktree(designId, branchId) }
      }
      const selectedRevision = branch.selectedRevisionId
        ? this.store.getDesignAtBranch(designId, branchId)?.revisions.find((revision) => revision.id === branch.selectedRevisionId)
        : null
      const hasActiveGeneration = this.store.getDesignAtBranch(designId, branchId)?.generationJobs.some((job) => job.state === 'running') ?? false
      if (hasActiveGeneration) {
        // The provider owns the branch worktree until its job completes. Switching the visible branch
        // must never check out over in-progress files.
      } else if (selectedRevision && selectedRevision.id !== branch.activeRevisionId && selectedRevision.gitCommit) {
        this.repositories.checkoutRevision(designId, selectedRevision.gitCommit, branchId)
      } else {
        this.repositories.checkoutBranchHead(designId, branchId)
      }
    } catch (error) {
      this.store.setDesignBranchStatus(designId, branchId, 'failed')
      throw error
    }
    if (branch.status === 'failed') this.store.setDesignBranchStatus(designId, branchId, 'ready')
    return this.store.switchDesignBranch(designId, branchId)
  }

  public removeDesignBranch(designId: string, branchId: string, force = false): DesignBranch[] {
    const branch = this.store.listDesignBranches(designId).find((candidate) => candidate.id === branchId)
    if (!branch) throw new Error('Design branch not found.')
    if (branch.isMain) throw new Error('Main cannot be removed.')
    if (this.store.getDesign(designId)?.activeBranchId === branchId) throw new Error('Switch to another branch before removing this branch.')
    const branchState = this.store.getDesignAtBranch(designId, branchId)
    if (branchState?.generationJobs.some((job) => job.state === 'queued' || job.state === 'running')) {
      throw new Error('Finish or stop this branch\'s active work before removing it.')
    }
    this.repositories.removeBranchWorktree(designId, branchId, force)
    this.store.removeDesignBranchRecord(designId, branchId)
    return this.store.listDesignBranches(designId)
  }
  public renameProject(projectId: string, name: string): ProjectSummary { return this.store.renameProject(projectId, name) }
  public getProjectDesignDefinitionState(projectId: string): ProjectDesignDefinitionState | null { return this.store.getProjectDesignDefinitionState(projectId) }
  public listProjectDesignDefinitionVersions(projectId: string): ProjectDesignDefinitionVersion[] { return this.store.listProjectDesignDefinitionVersions(projectId) }
  public saveProjectDesignDefinitions(projectId: string, definitions: ProjectDesignDefinitions): ProjectDesignDefinitionVersion { return this.store.saveProjectDesignDefinitions(projectId, definitions) }
  public setProjectDefinitionPromptSuppressed(projectId: string, suppressed: boolean): ProjectDesignDefinitionState { return this.store.setProjectDefinitionPromptSuppressed(projectId, suppressed) }
  public keepProjectDesignDefinitions(designId: string, targetVersion: number): Design { return this.store.keepProjectDesignDefinitions(designId, targetVersion) }

  public async applyProjectDesignDefinitions(designId: string, targetVersion: number, branchId = this.store.getDesign(designId)?.activeBranchId): Promise<Design> {
    if (!branchId) throw new Error('Design branch not found.')
    const design = this.store.getDesignAtBranch(designId, branchId)
    if (!design || design.pendingDefinitionVersion !== targetVersion) throw new Error('The requested project-definition decision is no longer pending.')
    const target = this.store.listProjectDesignDefinitionVersions(design.projectId).find((candidate) => candidate.version === targetVersion)
    if (!target) throw new Error('The requested project definitions are missing.')
    const current = design.definitionVersion
      ? this.store.listProjectDesignDefinitionVersions(design.projectId).find((candidate) => candidate.version === design.definitionVersion) ?? null
      : null
    if (design.activeRevisionId && (!current || !canUpdateProjectThemeDeterministically(current.definitions, target.definitions))) {
      const diagnostic = 'This change needs AI interpretation. Choose an available provider to apply it.'
      this.store.startProjectDefinitionApplicationAttempt(designId, targetVersion, { mechanism: 'ai', state: 'unavailable', diagnostic, branchId })
      return this.store.failProjectDefinitionApplication(designId, targetVersion, diagnostic, true, branchId)
    }
    const attempt = this.store.startProjectDefinitionApplicationAttempt(designId, targetVersion, { mechanism: 'deterministic', branchId })
    if (design.generationJobs.some((job) => job.state === 'queued' || job.state === 'running')) {
      const diagnostic = 'Finish or stop the design’s active work before applying project definitions.'
      this.store.finishProjectDefinitionApplicationAttempt(attempt.id, 'failed', diagnostic)
      return this.store.failProjectDefinitionApplication(designId, targetVersion, diagnostic, false, branchId)
    }

    this.store.beginProjectDefinitionApplication(designId, targetVersion, branchId)
    try {
      this.repositories.checkoutBranchHead(designId, branchId)
      const sourceFiles = materializeProjectTheme(this.repositories.readWorkingTreeFiles(designId, branchId), target)
      this.repositories.writeSourceFiles(designId, sourceFiles, branchId)
      if (!design.activeRevisionId) {
        const completed = this.store.completeProjectDefinitionApplication(designId, targetVersion, branchId)
        this.store.finishProjectDefinitionApplicationAttempt(attempt.id, 'completed')
        return completed
      }
      const tailwindCss = await compileTailwindCssForFiles(sourceFiles)
      validateDesignFiles(sourceFiles)
      const gitCommit = this.repositories.commitRevision(designId, null, tailwindCss, `Apply project definitions version ${targetVersion}`, branchId)
      const revised = gitCommit ? this.store.addRevision(designId, `Apply project definitions version ${targetVersion}`, 'omnidesign', 'deterministic', gitCommit, `Applied project definitions version ${targetVersion}.`, targetVersion, branchId) : null
      const completed = this.store.completeProjectDefinitionApplication(designId, targetVersion, branchId)
      this.store.finishProjectDefinitionApplicationAttempt(attempt.id, 'completed', null, revised?.activeRevisionId ?? null)
      return completed
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Project definitions could not be applied.'
      this.store.failProjectDefinitionApplication(designId, targetVersion, message, false, branchId)
      this.store.finishProjectDefinitionApplicationAttempt(attempt.id, 'failed', message)
      throw error
    }
  }

  public async applyProjectDesignDefinitionsToAll(projectId: string, targetVersion: number): Promise<Design[]> {
    const pending = this.store.listDesignsByProject(projectId).flatMap((design) => design.branches
      .map((branch) => this.store.getDesignAtBranch(design.id, branch.id))
      .filter((candidate): candidate is Design => candidate?.pendingDefinitionVersion === targetVersion))
    const results: Design[] = []
    for (const design of pending) {
      try { results.push(await this.applyProjectDesignDefinitions(design.id, targetVersion, design.activeBranchId)) }
      catch { const failed = this.store.getDesignAtBranch(design.id, design.activeBranchId); if (failed) results.push(failed) }
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

  public getDesignRepositoryPath(designId: string, branchId = this.store.getDesign(designId)?.activeBranchId): string {
    if (!branchId || !this.store.getDesignAtBranch(designId, branchId)) throw new Error('Design branch not found.')
    return this.repositories.getWorkingPath(designId, branchId)
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

  public getInitialProjectDefinitionPromptContext(designId: string, branchId?: string): string {
    const design = branchId ? this.store.getDesignAtBranch(designId, branchId) : this.store.getDesign(designId)
    if (!design || design.activeRevisionId) return ''
    const definitionVersion = this.definitionVersionForDesign(design)
    return definitionVersion ? createProjectDefinitionPromptContext(definitionVersion) : ''
  }

  public async generate(designId: string, prompt: string, onActivity: ActivityListener, generatedHtml?: string, savePrompt = true, signal?: AbortSignal, maxRepairAttempts = 0, generatedFiles?: RevisionFiles, branchId = this.store.getDesign(designId)?.activeBranchId): Promise<Design> {
    if (!branchId) throw new Error('Design branch not found.')
    this.throwIfCancelled(signal)
    if (savePrompt) this.store.addPrompt(designId, prompt)
    onActivity({ designId, stage: 'generating', detail: 'Mock provider is shaping the requested direction.' })
    const current = this.store.getDesignAtBranch(designId, branchId)
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
        const gitCommit = this.repositories.commitGeneratedRevision(designId, generated.files, tailwindCss, `Apply design revision: ${prompt}`, branchId)
        const saved = this.store.addRevision(designId, prompt, 'mock', 'mock-v1', gitCommit, undefined, undefined, branchId)
        onActivity({ designId, stage: 'complete', detail: 'Revision is ready to preview.' })
        return saved
      } catch (error) {
        if (signal?.aborted) return this.cancelledDesign(designId, onActivity)
        const diagnostic = error instanceof Error ? error.message : 'Generation failed.'
        if (repairAttempt === maxRepairAttempts) {
          const rejected = this.store.addInvalidCandidate(designId, prompt, generated.html, diagnostic, 'OmniDesign couldn’t finish this design after a few tries. Review the notes below, then Continue or Retry.', branchId)
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
    if (revision.id === design.activeRevisionId) this.repositories.checkoutBranchHead(designId, design.activeBranchId)
    else if (revision.gitCommit) this.repositories.checkoutRevision(designId, revision.gitCommit, design.activeBranchId)
    return this.store.selectRevision(designId, revisionId)
  }

  /** Ensure the working tree is at the head of the main timeline before a new generation runs. */
  public prepareGenerationWorkspace(designId: string, branchId = this.store.getDesign(designId)?.activeBranchId): void {
    if (!branchId) throw new Error('Design branch not found.')
    this.repositories.checkoutBranchHead(designId, branchId)
  }

  public restoreRevision(designId: string, revisionId: string): Design {
    const design = this.store.getDesign(designId)
    if (!design) throw new Error('Design not found.')
    const revision = design.revisions.find((candidate) => candidate.id === revisionId)
    if (!revision) throw new Error('Revision not found.')
    if (!revision.gitCommit) throw new Error('Revision has no committed content to restore.')
    const gitCommit = this.repositories.restore(designId, revision.gitCommit, `Restore design revision: ${revision.prompt}`, design.activeBranchId)
    return this.store.restoreRevision(designId, revisionId, gitCommit)
  }

  /** Read a revision's committed files (all pages + shared build assets) for preview and export. */
  public getRevisionFiles(designId: string, revisionId: string): RevisionFiles {
    const revision = this.findRevision(designId, revisionId)
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

  private findRevision(designId: string, revisionId: string): Design['revisions'][number] | null {
    const design = this.store.getDesign(designId)
    if (!design) return null
    for (const branch of design.branches) {
      const revision = this.store.getDesignAtBranch(designId, branch.id)?.revisions.find((candidate) => candidate.id === revisionId)
      if (revision) return revision
    }
    return null
  }

  public compareDesignBranches(designId: string, sourceBranchId: string, destinationBranchId: string): BranchComparison {
    if (sourceBranchId === destinationBranchId) throw new Error('Choose two different branches.')
    const branches = this.store.listDesignBranches(designId)
    const sourceBranch = branches.find((branch) => branch.id === sourceBranchId)
    const destinationBranch = branches.find((branch) => branch.id === destinationBranchId)
    const sourceDesign = sourceBranch ? this.store.getDesignAtBranch(designId, sourceBranchId) : null
    const destinationDesign = destinationBranch ? this.store.getDesignAtBranch(designId, destinationBranchId) : null
    const sourceRevision = sourceDesign?.revisions.find((revision) => revision.id === sourceBranch?.activeRevisionId)
    const destinationRevision = destinationDesign?.revisions.find((revision) => revision.id === destinationBranch?.activeRevisionId)
    if (!sourceBranch || !destinationBranch || !sourceRevision?.gitCommit || !destinationRevision?.gitCommit) throw new Error('Both branches need a valid committed head before comparison.')
    const sourcePages = this.getRevisionPages(designId, sourceRevision.id)
    const destinationPages = this.getRevisionPages(designId, destinationRevision.id)
    return {
      source: { branchId: sourceBranch.id, title: sourceBranch.title, revisionId: sourceRevision.id, pages: sourcePages.pages, entryPagePath: sourcePages.entryPagePath },
      destination: { branchId: destinationBranch.id, title: destinationBranch.title, revisionId: destinationRevision.id, pages: destinationPages.pages, entryPagePath: destinationPages.entryPagePath },
      changes: this.repositories.compareRevisions(designId, destinationRevision.gitCommit, sourceRevision.gitCommit, destinationRevision.id, sourceRevision.id),
    }
  }

  public prepareBranchComparisonSummary(designId: string, sourceBranchId: string, destinationBranchId: string): { readonly comparison: BranchComparison; readonly sourceCommit: string; readonly destinationCommit: string; readonly sourcePath: string; readonly destinationPath: string; readonly conversationContext: string } {
    const comparison = this.compareDesignBranches(designId, sourceBranchId, destinationBranchId)
    const source = this.store.getDesignAtBranch(designId, sourceBranchId)
    const destination = this.store.getDesignAtBranch(designId, destinationBranchId)
    const sourceRevision = source?.revisions.find((revision) => revision.id === comparison.source.revisionId)
    const destinationRevision = destination?.revisions.find((revision) => revision.id === comparison.destination.revisionId)
    if (!sourceRevision?.gitCommit || !destinationRevision?.gitCommit) throw new Error('Both branches need a valid committed head before comparison.')
    const formatConversation = (label: string, messages: readonly Design['messages'][number][]) => `${label}:\n${messages.map((message) => `${message.role}: ${message.text}`).join('\n')}`
    return {
      comparison,
      sourceCommit: sourceRevision.gitCommit,
      destinationCommit: destinationRevision.gitCommit,
      sourcePath: this.repositories.getWorkingPath(designId, sourceBranchId),
      destinationPath: this.repositories.getWorkingPath(designId, destinationBranchId),
      conversationContext: `${formatConversation('Source conversation', source?.messages ?? [])}\n\n${formatConversation('Destination conversation', destination?.messages ?? [])}`,
    }
  }

  public saveBranchComparisonSummary(designId: string, sourceBranchId: string, destinationBranchId: string, sourceCommit: string, destinationCommit: string, summary: string, selection: GenerationSelection): BranchComparisonSummary {
    return this.store.saveBranchComparisonSummary(designId, sourceBranchId, destinationBranchId, sourceCommit, destinationCommit, summary, selection)
  }

  public listBranchComparisonSummaries(designId: string): BranchComparisonSummary[] {
    return this.store.listBranchComparisonSummaries(designId).map((summary) => {
      const source = summary.sourceBranchId ? this.store.getDesignAtBranch(designId, summary.sourceBranchId) : null
      const destination = summary.destinationBranchId ? this.store.getDesignAtBranch(designId, summary.destinationBranchId) : null
      const sourceCommit = source?.revisions.find((revision) => revision.id === source.activeRevisionId)?.gitCommit
      const destinationCommit = destination?.revisions.find((revision) => revision.id === destination.activeRevisionId)?.gitCommit
      return { ...summary, stale: sourceCommit !== summary.sourceCommit || destinationCommit !== summary.destinationCommit }
    })
  }

  public resolveBranchContextsForGeneration(designId: string, destinationBranchId: string, references: readonly BranchContextReference[]): { readonly contexts: ResolvedBranchContext[]; readonly referencePaths: string[] } {
    const contexts: ResolvedBranchContext[] = []
    const referencePaths: string[] = []
    for (const reference of references) {
      if (reference.designId !== designId || reference.branchId === destinationBranchId) throw new Error('An attached branch reference is invalid for this prompt.')
      const branch = this.store.listDesignBranches(designId).find((candidate) => candidate.id === reference.branchId)
      const branchDesign = branch ? this.store.getDesignAtBranch(designId, branch.id) : null
      const head = branchDesign?.revisions.find((revision) => revision.id === branch?.activeRevisionId)
      if (!branch || !branchDesign || !head?.gitCommit) throw new Error(`Attached branch "${reference.title}" is unavailable. Remove the reference or cancel this prompt.`)
      const messages = branchDesign.messages.filter((message) => message.ownerBranchId === branch.id)
      contexts.push({
        designId,
        branchId: branch.id,
        title: branch.title,
        status: 'available',
        commit: head.gitCommit,
        conversationCutoffMessageId: messages.at(-1)?.id ?? null,
        conversation: messages.map((message) => `${message.role}: ${message.text}`).join('\n'),
        summarized: false,
        disclosure: null,
      })
      referencePaths.push(this.repositories.getWorkingPath(designId, branch.id))
    }
    return { contexts, referencePaths }
  }

  public startCombination(designId: string, sourceBranchId: string, destinationBranchId: string, prompt: string, selection: GenerationSelection): { readonly attempt: CombinationAttempt; readonly sourcePath: string; readonly destinationPath: string; readonly conversationContext: string } {
    const source = this.store.getDesignAtBranch(designId, sourceBranchId)
    const destination = this.store.getDesignAtBranch(designId, destinationBranchId)
    const sourceBranch = source?.branches.find((branch) => branch.id === sourceBranchId)
    const destinationBranch = destination?.branches.find((branch) => branch.id === destinationBranchId)
    if (!source || !destination || !sourceBranch || !destinationBranch) throw new Error('Design branch not found.')
    const sourceRevision = source?.revisions.find((revision) => revision.id === sourceBranch?.activeRevisionId)
    const destinationRevision = destination?.revisions.find((revision) => revision.id === destinationBranch?.activeRevisionId)
    if (!sourceRevision?.gitCommit || !destinationRevision?.gitCommit) throw new Error('Both branches need a valid committed head before combination.')
    this.repositories.checkoutBranchHead(designId, destinationBranchId)
    const attempt = this.store.beginCombinationAttempt(designId, sourceBranchId, destinationBranchId, sourceRevision.gitCommit, destinationRevision.gitCommit, prompt, selection)
    const divergenceMessageId = sourceBranch?.forkMessageId ?? destinationBranch?.forkMessageId
    const sourceMessages = divergenceMessageId ? source.messages.slice(Math.max(0, source.messages.findIndex((message) => message.id === divergenceMessageId))) : source.messages
    const destinationMessages = divergenceMessageId ? destination.messages.slice(Math.max(0, destination.messages.findIndex((message) => message.id === divergenceMessageId))) : destination.messages
    const summarize = (label: string, messages: readonly Design['messages'][number][]) => `${label}:\n${messages.map((message) => `${message.role}: ${message.text}`).join('\n')}`
    return {
      attempt,
      sourcePath: this.repositories.getWorkingPath(designId, sourceBranchId),
      destinationPath: this.repositories.getWorkingPath(designId, destinationBranchId),
      conversationContext: `${summarize('Source branch conversation since divergence', sourceMessages)}\n\n${summarize('Destination branch conversation since divergence', destinationMessages)}`,
    }
  }

  public async completeIntelligentCombination(attemptId: string, response: string): Promise<CombinationAttempt> {
    return this.finishCombinationWorkingTree(attemptId, response, 'none')
  }

  public beginCombinationFallback(attemptId: string, diagnostic: string, response: string | null = null): CombinationAttempt {
    const attempt = this.store.getCombinationAttempt(attemptId)
    if (!attempt?.destinationBranchId || attempt.state !== 'applying') throw new Error('Combination attempt is not active.')
    const fallback = this.repositories.beginFallbackMerge(attempt.designId, attempt.destinationBranchId, attempt.destinationCommit, attempt.sourceCommit)
    return this.store.setCombinationManualResolution(attempt.id, fallback.conflicts.length ? `${diagnostic}\nConflicts: ${fallback.conflicts.join(', ')}` : diagnostic, response, fallback.clean ? 'automatic_merge' : 'manual_resolution')
  }

  public async finishManualCombination(attemptId: string): Promise<CombinationAttempt> {
    const attempt = this.store.getCombinationAttempt(attemptId)
    return this.finishCombinationWorkingTree(attemptId, null, attempt?.fallbackPath === 'automatic_merge' ? 'automatic_merge' : 'manual_resolution')
  }

  public abortCombination(attemptId: string): CombinationAttempt {
    const attempt = this.store.getCombinationAttempt(attemptId)
    if (!attempt?.destinationBranchId || !['applying', 'manual_resolution'].includes(attempt.state)) throw new Error('Combination attempt is not active.')
    this.repositories.restoreBranchToCommit(attempt.designId, attempt.destinationBranchId, attempt.destinationCommit)
    return this.store.stopCombinationAttempt(attempt.id, 'aborted', 'Combination was aborted and the destination branch was restored.', attempt.response)
  }

  public getCombinationAttempt(attemptId: string): CombinationAttempt | null { return this.store.getCombinationAttempt(attemptId) }
  public listCombinationAttempts(designId: string): CombinationAttempt[] { return this.store.listCombinationAttempts(designId) }
  public getCombinationPreview(attemptId: string): { readonly designId: string; readonly revisionId: string; readonly files: RevisionFiles; readonly pages: RevisionPages } {
    const attempt = this.store.getCombinationAttempt(attemptId)
    if (!attempt?.destinationBranchId || attempt.state !== 'manual_resolution') throw new Error('Combination attempt is not awaiting manual resolution.')
    const files = this.repositories.readWorkingTreeFiles(attempt.designId, attempt.destinationBranchId)
    const discovered = discoverPages(files)
    const entryPagePath = resolveEntryPage(discovered)
    return { designId: attempt.designId, revisionId: `combination-${attempt.id}`, files, pages: { pages: discovered.map((page, order) => ({ path: page, title: extractPageTitle(files[page] ?? ''), order, isHome: page === entryPagePath })), entryPagePath } }
  }

  private async finishCombinationWorkingTree(attemptId: string, response: string | null, fallbackPath: 'none' | 'automatic_merge' | 'manual_resolution'): Promise<CombinationAttempt> {
    const attempt = this.store.getCombinationAttempt(attemptId)
    if (!attempt?.destinationBranchId || !['applying', 'manual_resolution'].includes(attempt.state)) throw new Error('Combination attempt is not active.')
    const files = this.repositories.readWorkingTreeFiles(attempt.designId, attempt.destinationBranchId)
    const tailwindCss = await compileTailwindCssForFiles(files)
    this.repositories.writeSourceFiles(attempt.designId, files, attempt.destinationBranchId)
    this.repositories.writeManagedBuildOutputs(attempt.designId, attempt.destinationBranchId, tailwindCss)
    validateDesignFiles(files)
    const mergeCommit = this.repositories.commitCombinationRevision(attempt.designId, attempt.destinationBranchId, attempt.destinationCommit, attempt.sourceCommit, `Combine ${attempt.sourceBranchTitle} into ${attempt.destinationBranchTitle}`)
    const revised = this.store.addRevision(attempt.designId, attempt.prompt, attempt.providerId, attempt.modelId, mergeCommit, response ?? `Combined ${attempt.sourceBranchTitle} into ${attempt.destinationBranchTitle}.`, undefined, attempt.destinationBranchId)
    const revisionId = revised.activeRevisionId
    if (!revisionId) throw new Error('The combination revision could not be recorded.')
    return this.store.completeCombinationAttempt(attempt.id, revisionId, mergeCommit, response, fallbackPath)
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
    branchId = this.store.getDesign(designId)?.activeBranchId,
  ): Promise<Design> {
    if (!branchId) throw new Error('Design branch not found.')
    const current = this.store.getDesignAtBranch(designId, branchId)
    if (!current) throw new Error('Design not found.')

    try {
      let sourceFiles = this.repositories.readWorkingTreeFiles(designId, branchId)
      const definitionVersion = definitionTargetVersion
        ? this.store.listProjectDesignDefinitionVersions(current.projectId).find((candidate) => candidate.version === definitionTargetVersion) ?? null
        : current.activeRevisionId ? null : this.definitionVersionForDesign(current)
      if (definitionTargetVersion && !definitionVersion) throw new Error('The requested project definitions are missing.')
      if (definitionVersion) {
        sourceFiles = materializeProjectTheme(sourceFiles, definitionVersion)
        this.repositories.writeSourceFiles(designId, sourceFiles, branchId)
      }
      onActivity({ designId, stage: 'compiling', detail: 'Preparing the design’s styles.' })
      const tailwindCss = await compileTailwindCssForFiles(sourceFiles)
      onActivity({ designId, stage: 'validating', detail: 'Checking the design.' })
      validateDesignFiles(sourceFiles)
      onActivity({ designId, stage: 'saving', detail: 'Saving your design.' })
      const gitCommit = this.repositories.commitRevision(designId, null, tailwindCss, `Apply agent result: ${prompt}`, branchId)
      if (gitCommit === null) {
        onActivity({ designId, stage: 'complete', detail: 'No changes were needed.' })
        return this.store.addAssistantResponse(designId, response, branchId)
      }
      const saved = this.store.addRevision(designId, prompt, providerId, modelId, gitCommit, response, definitionTargetVersion ?? current.definitionVersion ?? null, branchId)
      onActivity({ designId, stage: 'complete', detail: 'Your design is ready.' })
      return saved
    } catch (error) {
      const diagnostic = error instanceof Error ? error.message : 'Agent result validation failed.'
      // Intermediate failures inside a repair loop are recorded for diagnostics but stay out of the
      // conversation: only a final, unrecoverable failure posts a system message and the agent's reply,
      // so a design that is fixed on a later attempt shows no leftover rejection.
      if (allowRepair) {
        const rejected = this.store.addInvalidCandidate(designId, prompt, this.readEntryPageForDiagnostics(designId, branchId), diagnostic, null, branchId)
        onActivity({ designId, stage: 'repairing', detail: 'Making a few improvements…' })
        return rejected
      }
      const rejected = this.store.addInvalidCandidate(designId, prompt, this.readEntryPageForDiagnostics(designId, branchId), diagnostic, 'OmniDesign couldn’t finish this design after a few tries. Review the notes below, then Continue or Retry.', branchId)
      this.store.addAssistantResponse(designId, response, branchId)
      onActivity({ designId, stage: 'failed', detail: 'Couldn’t finish the design after a few tries.' })
      return rejected
    }
  }

  public saveDraft(designId: string, draft: string, attachments: readonly import('./contracts.js').Attachment[] = [], branchContexts: readonly import('./contracts.js').BranchContextReference[] = []): void {
    this.store.saveDraft(designId, draft, attachments, branchContexts)
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
  private readEntryPageForDiagnostics(designId: string, branchId = this.store.getDesign(designId)?.activeBranchId): string {
    if (!branchId) throw new Error('Design branch not found.')
    const files = this.repositories.readWorkingTreeFiles(designId, branchId)
    const entry = resolveEntryPage(discoverPages(files))
    if (entry && files[entry] !== undefined) return files[entry]
    return this.repositories.readIndexHtml(designId, branchId)
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
