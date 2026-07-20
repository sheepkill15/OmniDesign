import { compileDesignHtml, validateCompiledDesign } from './compiler.js'
import type { Design, GenerationActivity, Layout } from './contracts.js'
import { generateMockDesign } from './mockGenerator.js'
import { WorkspaceStore } from './store.js'

type ActivityListener = (activity: GenerationActivity) => void

export class WorkspaceService {
  public constructor(private readonly store: WorkspaceStore) {}

  public listDesigns(): Design[] {
    return this.store.listDesigns()
  }

  public getDesign(designId: string): Design | null {
    return this.store.getDesign(designId)
  }

  public async createDesign(prompt: string, onActivity: ActivityListener): Promise<Design> {
    const generated = generateMockDesign(prompt)
    const design = this.store.createStandaloneDesign(prompt, generated.title)
    return this.generate(design.id, prompt, onActivity, generated.html, false)
  }

  public async generate(designId: string, prompt: string, onActivity: ActivityListener, generatedHtml?: string, savePrompt = true): Promise<Design> {
    let candidate: string | null = null
    try {
      if (savePrompt) this.store.addPrompt(designId, prompt)
      onActivity({ designId, stage: 'generating', detail: 'Mock provider is shaping the requested direction.' })
      const current = this.store.getDesign(designId)
      if (!current) throw new Error('Design not found.')
      const previous = current.revisions.find((revision) => revision.id === current.activeRevisionId)?.html
      candidate = generatedHtml ?? generateMockDesign(prompt, previous).html
      onActivity({ designId, stage: 'compiling', detail: 'Compiling the generated Tailwind classes.' })
      const compiled = await compileDesignHtml(candidate)
      onActivity({ designId, stage: 'validating', detail: 'Checking document structure and preview security.' })
      validateCompiledDesign(compiled)
      onActivity({ designId, stage: 'saving', detail: 'Saving an immutable local revision.' })
      const saved = this.store.addRevision(designId, prompt, compiled)
      onActivity({ designId, stage: 'complete', detail: 'Revision is ready to preview.' })
      return saved
    } catch (error) {
      const diagnostic = error instanceof Error ? error.message : 'Generation failed.'
      const rejected = candidate ? this.store.addInvalidCandidate(designId, prompt, candidate, diagnostic) : null
      onActivity({ designId, stage: 'failed', detail: diagnostic })
      if (rejected) return rejected
      throw error
    }
  }

  public selectRevision(designId: string, revisionId: string): Design {
    return this.store.selectRevision(designId, revisionId)
  }

  public restoreRevision(designId: string, revisionId: string): Design {
    return this.store.restoreRevision(designId, revisionId)
  }

  public saveDraft(designId: string, draft: string): void {
    this.store.saveDraft(designId, draft)
  }

  public saveLayout(designId: string, layout: Layout): void {
    this.store.saveLayout(designId, layout)
  }
}
