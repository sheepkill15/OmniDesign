import { compileTailwindCss, validateCompiledDesign } from './compiler.js'
import type { Design, GenerationActivity, GenerationSelection, Layout, Theme } from './contracts.js'
import { DesignRepositoryManager } from './designRepository.js'
import type { RevisionFiles } from './designRepository.js'
import { generateMockDesign } from './mockGenerator.js'
import { WorkspaceStore } from './store.js'

type ActivityListener = (activity: GenerationActivity) => void

export class WorkspaceService {
  private readonly repositories: DesignRepositoryManager

  public constructor(private readonly store: WorkspaceStore) {
    this.repositories = new DesignRepositoryManager(store.getDesignArtifactsDirectory())
  }

  public listDesigns(): Design[] {
    return this.store.listDesigns()
  }

  public getDesign(designId: string): Design | null {
    return this.store.getDesign(designId)
  }

  public getDesignRepositoryPath(designId: string): string {
    if (!this.store.getDesign(designId)) throw new Error('Design not found.')
    return this.repositories.getPath(designId)
  }

  public async createDesign(prompt: string, onActivity: ActivityListener, sourceProjectPath?: string | null): Promise<Design> {
    const generated = generateMockDesign(prompt)
    const design = sourceProjectPath
      ? this.store.createLinkedDesign(prompt, generated.title, sourceProjectPath)
      : this.store.createStandaloneDesign(prompt, generated.title)
    onActivity({ designId: design.id, stage: 'queued', detail: 'Setting up design repository…' })
    this.repositories.initialize(design.id)
    return this.generate(design.id, prompt, onActivity, generated.html, false)
  }

  public createAgentDesignShell(prompt: string, onActivity: ActivityListener, sourceProjectPath?: string | null): Design {
    const generated = generateMockDesign(prompt)
    const design = sourceProjectPath
      ? this.store.createLinkedDesign('', generated.title, sourceProjectPath)
      : this.store.createStandaloneDesign('', generated.title)
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
    return this.store.selectRevision(designId, revisionId)
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

  public saveDraft(designId: string, draft: string): void {
    this.store.saveDraft(designId, draft)
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
