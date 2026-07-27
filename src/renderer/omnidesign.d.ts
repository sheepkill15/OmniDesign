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

interface DesignPage {
  readonly path: string
  readonly title: string | null
  readonly order: number
  readonly isHome: boolean
}

interface RevisionPages {
  readonly pages: readonly DesignPage[]
  readonly entryPagePath: string | null
}

interface InvalidCandidate {
  readonly id: string
  readonly prompt: string
  readonly html: string
  readonly diagnostic: string
  readonly createdAt: string
}

type LayoutMode = 'split' | 'conversation' | 'preview' | 'popped'
type PreviewViewMode = 'canvas' | 'focused'
type PreviewFit = 'artboard' | 'fixed'
type PreviewDevice = 'phone' | 'tablet' | 'desktop' | 'custom'

interface Layout {
  readonly conversationWidth: number
  readonly mode: LayoutMode
  readonly previewViewMode: PreviewViewMode
  readonly previewFit: PreviewFit
  readonly previewDevice: PreviewDevice
  readonly previewCustomWidth: number
  readonly previewCustomHeight: number
  readonly previewPage: string | null
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
  readonly adaptationPending: boolean
  readonly entryPagePath: string | null
  readonly pages: readonly DesignPage[]
  readonly tags: readonly Tag[]
  readonly lastSelection: GenerationSelection
  readonly generationSteps: readonly GenerationStep[]
  readonly layout: Layout
  readonly messages: readonly DesignMessage[]
  readonly invalidCandidates: readonly InvalidCandidate[]
  readonly generationJobs: readonly GenerationJob[]
  readonly revisions: readonly DesignRevision[]
}

type TagColor = 'neutral' | 'mauve' | 'sand' | 'olive' | 'lavender' | 'blue' | 'rose' | 'amber'

interface Tag {
  readonly id: string
  readonly name: string
  readonly color: TagColor
  readonly createdAt: string
}

interface Folder {
  readonly id: string
  readonly name: string
  readonly parentFolderId: string | null
  readonly sortOrder: number
  readonly createdAt: string
  readonly updatedAt: string
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
  readonly lastProviderId: string | null
  readonly folderId: string | null
  readonly tags: readonly Tag[]
  readonly currentDefinitionVersion: number | null
  readonly definitionPromptSuppressed: boolean
}

interface ProjectDetail {
  readonly project: ProjectSummary
  readonly designs: readonly OmniDesignDocument[]
}

interface NamedDesignDefinition {
  readonly name: string
  readonly value: string
  readonly description: string | null
}

interface TypographyDesignDefinition {
  readonly name: string
  readonly fontFamily: string
  readonly fontSize: string
  readonly fontWeight: string
  readonly lineHeight: string
  readonly letterSpacing: string | null
  readonly description: string | null
}

interface ProjectDesignDefinitions {
  readonly schemaVersion: 1
  readonly colors: readonly NamedDesignDefinition[]
  readonly typography: readonly TypographyDesignDefinition[]
  readonly spacing: readonly NamedDesignDefinition[]
  readonly shape: readonly NamedDesignDefinition[]
  readonly visualGuidance: string
  readonly aiAgentInstructions: string
}

interface ProjectDesignDefinitionVersion {
  readonly id: string
  readonly projectId: string
  readonly version: number
  readonly definitions: ProjectDesignDefinitions
  readonly createdAt: string
}

interface ProjectDesignDefinitionState {
  readonly current: ProjectDesignDefinitionVersion | null
  readonly promptSuppressed: boolean
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
      getProjectDesignDefinitions(projectId: string): Promise<ProjectDesignDefinitionState | null>
      saveProjectDesignDefinitions(projectId: string, definitions: ProjectDesignDefinitions): Promise<ProjectDesignDefinitionVersion>
      proposeProjectDesignDefinitions(projectId: string, providerId: 'mock' | 'codex' | 'claude', modelId: string, effort?: string | null): Promise<ProjectDesignDefinitions>
      setProjectDefinitionPromptSuppressed(projectId: string, suppressed: boolean): Promise<ProjectDesignDefinitionState>
      associateDesign(designId: string, projectId: string): Promise<OmniDesignDocument>
      duplicateDesign(designId: string): Promise<OmniDesignDocument>
      associateAndRestart(designId: string, projectId: string): Promise<OmniDesignDocument | null>
      dismissAdaptation(designId: string): Promise<OmniDesignDocument | null>
      listFolders(): Promise<Folder[]>
      createFolder(name: string, parentFolderId?: string | null): Promise<Folder>
      renameFolder(folderId: string, name: string): Promise<Folder>
      deleteFolder(folderId: string): Promise<void>
      moveProjectToFolder(projectId: string, folderId: string | null): Promise<ProjectSummary>
      listTags(): Promise<Tag[]>
      createTag(name: string, color: TagColor): Promise<Tag>
      deleteTag(tagId: string): Promise<void>
      tag(targetKind: 'project' | 'design', targetId: string, tagId: string): Promise<void>
      untag(targetKind: 'project' | 'design', targetId: string, tagId: string): Promise<void>
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
      saveLayout(designId: string, layout: Layout): Promise<void>
      saveSelection(designId: string, selection: GenerationSelection): Promise<void>
      exportRevision(designId: string, revisionId: string): Promise<{ readonly canceled: boolean; readonly filePath?: string }>
      revisionPages(designId: string, revisionId: string): Promise<RevisionPages>
      setEntryPage(designId: string, entryPagePath: string | null): Promise<OmniDesignDocument>
      savePageMetadata(designId: string, path: string, title: string | null, order: number): Promise<OmniDesignDocument>
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
      getLastOpenDesignId(): Promise<string | null>
      saveLastOpenDesignId(designId: string | null): Promise<void>
    }
    readonly preview: {
      register(designId: string, revisionId: string): Promise<{ readonly token: string; readonly pages: readonly DesignPage[]; readonly entryPagePath: string | null } | null>
      reportDiagnostic(designId: string, revisionId: string, diagnostic: { readonly level: 'warning' | 'error'; readonly message: string; readonly source: string | null; readonly line: number | null }): Promise<void>
      capture(designId: string, revisionId: string): Promise<boolean>
      popOut(request: { readonly designId: string; readonly revisionId: string; readonly page?: string }): Promise<void>
      closePopOut(): Promise<void>
      onDiagnostic(listener: (event: { readonly designId: string; readonly revisionId: string }) => void): () => void
      onThumbnail(listener: (event: { readonly designId: string; readonly revisionId: string }) => void): () => void
      onPoppedIn(listener: (event: { readonly designId: string }) => void): () => void
    }
  }
}
