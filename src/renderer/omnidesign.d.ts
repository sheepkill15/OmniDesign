interface ProviderModel {
  readonly id: string
  readonly name: string
  readonly effortLevels: readonly ProviderEffortLevel[]
}

interface ProviderEffortLevel {
  readonly id: string
  readonly name: string
  readonly isDefault: boolean
}

interface ProviderStatus {
  readonly id: 'codex' | 'claude'
  readonly name: string
  readonly installed: boolean
  readonly authenticated: boolean
  readonly detail: string
  readonly models: readonly ProviderModel[]
}

interface ProviderReply {
  readonly providerId: 'codex' | 'claude'
  readonly modelId: string
  readonly text: string
}

interface ProviderActivity {
  readonly requestId: string
  readonly providerId: 'codex' | 'claude'
  readonly kind: 'status' | 'text' | 'tool' | 'result' | 'diagnostic'
  readonly label: string
  readonly detail?: string
}

interface DesignRevision {
  readonly id: string
  readonly parentRevisionId: string | null
  readonly prompt: string
  readonly providerId: string
  readonly modelId: string
  readonly createdAt: string
  readonly thumbnailDataUrl: string | null
  readonly diagnostics: readonly PreviewDiagnostic[]
}

interface PreviewDiagnostic {
  readonly id: string
  readonly kind: 'console' | 'runtime' | 'load'
  readonly level: 'warning' | 'error'
  readonly message: string
  readonly source: string | null
  readonly line: number | null
  readonly createdAt: string
}

interface DesignMessage {
  readonly id: string
  readonly role: 'user' | 'assistant' | 'system'
  readonly text: string
  readonly createdAt: string
}

interface InvalidCandidate {
  readonly id: string
  readonly prompt: string
  readonly html: string
  readonly diagnostic: string
  readonly createdAt: string
}

interface GenerationSelection {
  readonly providerId: 'mock' | 'codex' | 'claude'
  readonly modelId: string
  readonly effort: string | null
}

interface GenerationStep {
  readonly id: string
  readonly stage: string
  readonly label: string
  readonly detail: string | null
  readonly createdAt: string
}

interface GenerationJob {
  readonly id: string
  readonly designId: string
  readonly prompt: string
  readonly providerId: 'mock' | 'codex' | 'claude'
  readonly modelId: string
  readonly effort?: string | null
  readonly state: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'
  readonly createdAt: string
  readonly startedAt: string | null
  readonly completedAt: string | null
  readonly error: string | null
}

interface OmniDesignDocument {
  readonly id: string
  readonly projectId: string
  readonly projectName: string
  readonly title: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly activeRevisionId: string | null
  readonly selectedRevisionId: string | null
  readonly draft: string
  readonly thumbnailDataUrl: string | null
  readonly queuePaused: boolean
  readonly lastSelection: GenerationSelection
  readonly generationSteps: readonly GenerationStep[]
  readonly layout: { readonly conversationWidth: number }
  readonly messages: readonly DesignMessage[]
  readonly invalidCandidates: readonly InvalidCandidate[]
  readonly generationJobs: readonly GenerationJob[]
  readonly revisions: readonly DesignRevision[]
}

interface ProjectSummary {
  readonly id: string
  readonly name: string
  readonly kind: 'standalone' | 'linked'
  readonly sourceProjectPath: string | null
  readonly sourceAvailable: boolean
  readonly designCount: number
  readonly createdAt: string
  readonly updatedAt: string
  readonly thumbnailDataUrl: string | null
  readonly latestDesignTitle: string | null
  readonly latestPrompt: string | null
}

interface ProjectDetail {
  readonly project: ProjectSummary
  readonly designs: readonly OmniDesignDocument[]
}

interface CreateDesignTarget {
  readonly sourceProjectPath?: string | null
  readonly projectId?: string | null
}

interface GenerationActivity {
  readonly designId: string
  readonly stage: 'queued' | 'generating' | 'compiling' | 'validating' | 'repairing' | 'saving' | 'complete' | 'failed' | 'cancelled' | 'interrupted'
  readonly detail: string
}

interface PreviewBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

interface Window {
  readonly omnidesign: {
    readonly providers: {
      discover(): Promise<ProviderStatus[]>
      prompt(request: { requestId: string; providerId: 'codex' | 'claude'; modelId: string; effort?: string; prompt: string }): Promise<ProviderReply>
      onActivity(listener: (activity: ProviderActivity) => void): () => void
    }
    readonly workspace: {
      list(): Promise<OmniDesignDocument[]>
      listProjects(): Promise<ProjectSummary[]>
      getProject(projectId: string): Promise<ProjectDetail | null>
      get(designId: string): Promise<OmniDesignDocument | null>
      create(prompt: string, providerId?: 'mock' | 'codex' | 'claude', modelId?: string, effort?: string, target?: CreateDesignTarget | null): Promise<OmniDesignDocument>
      generate(designId: string, prompt: string, providerId?: 'mock' | 'codex' | 'claude', modelId?: string, effort?: string): Promise<OmniDesignDocument>
      chooseProjectFolder(): Promise<string | null>
      cancelGeneration(jobId: string): Promise<GenerationJob>
      retryGeneration(jobId: string): Promise<GenerationJob>
      selectRevision(designId: string, revisionId: string): Promise<OmniDesignDocument>
      restoreRevision(designId: string, revisionId: string): Promise<OmniDesignDocument>
      saveDraft(designId: string, draft: string): Promise<void>
      saveLayout(designId: string, layout: { readonly conversationWidth: number }): Promise<void>
      saveSelection(designId: string, selection: GenerationSelection): Promise<void>
      exportRevision(designId: string, revisionId: string): Promise<{ readonly canceled: boolean; readonly filePath?: string }>
      onActivity(listener: (activity: GenerationActivity) => void): () => void
    }
    readonly settings: {
      getTheme(): Promise<'dark' | 'light'>
      saveTheme(theme: 'dark' | 'light'): Promise<void>
      getGenerationDefaults(): Promise<GenerationSelection>
      saveGenerationDefaults(selection: GenerationSelection): Promise<void>
    }
    readonly preview: {
      show(request: { readonly designId: string; readonly revisionId: string; readonly bounds: PreviewBounds }): Promise<void>
      resize(bounds: PreviewBounds): Promise<void>
      hide(): Promise<void>
      onDiagnostic(listener: (event: { readonly designId: string; readonly revisionId: string }) => void): () => void
      onThumbnail(listener: (event: { readonly designId: string; readonly revisionId: string }) => void): () => void
    }
  }
}
