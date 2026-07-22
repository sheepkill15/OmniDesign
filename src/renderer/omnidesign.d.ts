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
  readonly id: 'mock' | 'codex' | 'claude'
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
  readonly kind: 'console' | 'runtime' | 'load' | 'quality'
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
  readonly attachments?: readonly DesignAttachment[]
  readonly createdAt: string
}

interface InvalidCandidate {
  readonly id: string
  readonly prompt: string
  readonly html: string
  readonly diagnostic: string
  readonly createdAt: string
}

type LayoutMode = 'split' | 'conversation' | 'preview' | 'popped'

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
  readonly attachments: readonly DesignAttachment[]
  readonly mode?: 'fresh' | 'continue'
  readonly providerSessionId?: string | null
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
  readonly sourceProjectPath: string | null
  readonly title: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly activeRevisionId: string | null
  readonly selectedRevisionId: string | null
  readonly draft: string
  readonly draftAttachments: readonly DesignAttachment[]
  readonly thumbnailDataUrl: string | null
  readonly queuePaused: boolean
  readonly titlePending: boolean
  readonly lastSelection: GenerationSelection
  readonly generationSteps: readonly GenerationStep[]
  readonly layout: { readonly conversationWidth: number; readonly mode: LayoutMode }
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

interface TrashItem {
  readonly id: string
  readonly kind: 'project' | 'design'
  readonly name: string
  readonly projectId: string | null
  readonly projectName: string | null
  readonly sourceProjectPath: string | null
  readonly trashedAt: string
  readonly purgeAt: string
}

interface DesignAttachment {
  readonly id: string
  readonly path: string
  readonly name: string
  readonly kind: 'file' | 'folder'
  readonly size: number | null
  readonly modifiedAt: string | null
  readonly selectedAt: string
  readonly status: 'available' | 'changed' | 'missing'
}

interface CreateDesignTarget {
  readonly sourceProjectPath?: string | null
  readonly projectId?: string | null
  readonly cloneRemoteUrl?: string | null
  readonly cloneDestinationDirectory?: string | null
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
      readonly developmentProviderEnabled: boolean
      discover(): Promise<ProviderStatus[]>
      prompt(request: { requestId: string; providerId: 'codex' | 'claude'; modelId: string; effort?: string; prompt: string }): Promise<ProviderReply>
      onActivity(listener: (activity: ProviderActivity) => void): () => void
    }
    readonly workspace: {
      list(): Promise<OmniDesignDocument[]>
      listProjects(): Promise<ProjectSummary[]>
      getProject(projectId: string): Promise<ProjectDetail | null>
      associateDesign(designId: string, projectId: string): Promise<OmniDesignDocument>
      associateAndRestart(designId: string, projectId: string): Promise<OmniDesignDocument | null>
      listTrash(): Promise<TrashItem[]>
      cloneProject(remoteUrl: string, destinationPath: string): Promise<ProjectSummary>
      registerLinkedProject(sourceProjectPath: string): Promise<ProjectSummary>
      reconnectProject(projectId: string, sourceProjectPath: string): Promise<ProjectSummary>
      convertProjectToStandalone(projectId: string): Promise<ProjectSummary>
      trash(kind: 'project' | 'design', id: string): Promise<{ readonly cancelled: boolean }>
      restoreTrash(kind: 'project' | 'design', id: string): Promise<ProjectSummary | OmniDesignDocument>
      purgeTrash(kind: 'project' | 'design', id: string): Promise<void>
      get(designId: string): Promise<OmniDesignDocument | null>
      renameDesign(designId: string, title: string): Promise<OmniDesignDocument>
      renameProject(projectId: string, name: string): Promise<ProjectSummary>
      create(prompt: string, providerId?: 'mock' | 'codex' | 'claude', modelId?: string, effort?: string, target?: CreateDesignTarget | null, attachments?: readonly DesignAttachment[]): Promise<OmniDesignDocument>
      generate(designId: string, prompt: string, providerId?: 'mock' | 'codex' | 'claude', modelId?: string, effort?: string, attachments?: readonly DesignAttachment[]): Promise<OmniDesignDocument>
      chooseProjectFolder(): Promise<string | null>
      chooseAttachments(kind: 'files' | 'folder'): Promise<DesignAttachment[]>
      openAttachment(attachment: DesignAttachment): Promise<void>
      cancelGeneration(jobId: string): Promise<GenerationJob>
      removeGeneration(jobId: string): Promise<GenerationJob>
      retryGeneration(jobId: string): Promise<GenerationJob>
      continueGeneration(jobId: string): Promise<GenerationJob>
      resumeGenerationQueue(designId: string): Promise<OmniDesignDocument>
      selectRevision(designId: string, revisionId: string): Promise<OmniDesignDocument>
      restoreRevision(designId: string, revisionId: string): Promise<OmniDesignDocument>
      saveDraft(designId: string, draft: string, attachments?: readonly DesignAttachment[]): Promise<void>
      saveLayout(designId: string, layout: { readonly conversationWidth: number; readonly mode: LayoutMode }): Promise<void>
      saveSelection(designId: string, selection: GenerationSelection): Promise<void>
      exportRevision(designId: string, revisionId: string): Promise<{ readonly canceled: boolean; readonly filePath?: string }>
      onActivity(listener: (activity: GenerationActivity) => void): () => void
      onChanged(listener: (event: { readonly designId: string }) => void): () => void
      onCloneActivity(listener: (detail: string) => void): () => void
    }
    readonly settings: {
      getTheme(): Promise<'dark' | 'light'>
      saveTheme(theme: 'dark' | 'light'): Promise<void>
      getNotificationsEnabled(): Promise<boolean>
      saveNotificationsEnabled(enabled: boolean): Promise<void>
      getGenerationDetail(): Promise<'full' | 'concise'>
      saveGenerationDetail(detail: 'full' | 'concise'): Promise<void>
      getGenerationDefaults(): Promise<GenerationSelection>
      saveGenerationDefaults(selection: GenerationSelection): Promise<void>
    }
    readonly preview: {
      show(request: { readonly designId: string; readonly revisionId: string; readonly bounds: PreviewBounds }): Promise<void>
      resize(bounds: PreviewBounds): Promise<void>
      hide(): Promise<void>
      popOut(request: { readonly designId: string; readonly revisionId: string }): Promise<void>
      setSuspended(suspended: boolean): Promise<void>
      freeze(): Promise<string | null>
      onDiagnostic(listener: (event: { readonly designId: string; readonly revisionId: string }) => void): () => void
      onThumbnail(listener: (event: { readonly designId: string; readonly revisionId: string }) => void): () => void
      onPoppedIn(listener: (event: { readonly designId: string }) => void): () => void
    }
  }
}
