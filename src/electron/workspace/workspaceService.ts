import { compileDesignHtml, validateCompiledDesign } from './compiler.js'
import type { Design, GenerationActivity, Layout, Theme } from './contracts.js'
import { DesignRepositoryManager } from './designRepository.js'
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

  public async createDesign(prompt: string, onActivity: ActivityListener): Promise<Design> {
    const generated = generateMockDesign(prompt)
    const design = this.store.createStandaloneDesign(prompt, generated.title)
    this.repositories.initialize(design.id)
    return this.generate(design.id, prompt, onActivity, generated.html, false)
  }

  public async generate(designId: string, prompt: string, onActivity: ActivityListener, generatedHtml?: string, savePrompt = true, signal?: AbortSignal, maxRepairAttempts = 0): Promise<Design> {
    this.throwIfCancelled(signal)
    if (savePrompt) this.store.addPrompt(designId, prompt)
    onActivity({ designId, stage: 'generating', detail: 'Mock provider is shaping the requested direction.' })
    const current = this.store.getDesign(designId)
    if (!current) throw new Error('Design not found.')
    const previous = current.revisions.find((revision) => revision.id === current.activeRevisionId)?.html
    let candidate = generatedHtml ?? generateMockDesign(prompt, previous).html

    for (let repairAttempt = 0; repairAttempt <= maxRepairAttempts; repairAttempt += 1) {
      try {
        this.throwIfCancelled(signal)
        onActivity({ designId, stage: 'compiling', detail: 'Compiling the generated Tailwind classes.' })
        const compiled = await compileDesignHtml(candidate)
        this.throwIfCancelled(signal)
        onActivity({ designId, stage: 'validating', detail: 'Checking document structure and preview security.' })
        validateCompiledDesign(compiled)
        onActivity({ designId, stage: 'saving', detail: 'Saving an immutable local revision.' })
        const gitCommit = this.repositories.commitIndexHtml(designId, compiled, `Apply design revision: ${prompt}`)
        const saved = this.store.addRevision(designId, prompt, compiled, 'mock', 'mock-v1', gitCommit)
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
        candidate = generateMockDesign(`Repair this design without unsafe code or external resources: ${diagnostic}`, previous).html
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
    const gitCommit = this.repositories.commitIndexHtml(designId, revision.html, `Restore design revision: ${revision.prompt}`)
    return this.store.restoreRevision(designId, revisionId, gitCommit)
  }

  public saveDraft(designId: string, draft: string): void {
    this.store.saveDraft(designId, draft)
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
