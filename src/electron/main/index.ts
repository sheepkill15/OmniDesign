import { app, BrowserWindow, dialog, ipcMain, Notification, protocol, session, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import path from 'node:path'
import { isProviderId, ProviderService } from '../provider/providerService.js'
import { buildConversationRecap, createFocusedEditPrompt, createFocusedFeedbackBatchPrompt, normalizeAgentReply } from '../provider/agentHarness.js'
import type { ProviderPrompt } from '../provider/types.js'
import {
  createDesignRequestSchema,
  attachmentSchema,
  attachmentPickerRequestSchema,
  applyProjectDefinitionsToAllRequestSchema,
  associateDesignRequestSchema,
  cloneProjectRequestSchema,
  compareRevisionsRequestSchema,
  createFolderRequestSchema,
  createTagRequestSchema,
  designIdRequestSchema,
  folderIdRequestSchema,
  moveProjectToFolderRequestSchema,
  previewCaptureRequestSchema,
  previewDiagnosticReportSchema,
  previewPopOutRequestSchema,
  previewRegisterRequestSchema,
  proposeProjectDesignDefinitionsRequestSchema,
  renameFolderRequestSchema,
  tagIdRequestSchema,
  tagTargetRequestSchema,
  exportRequestSchema,
  generateRequestSchema,
  generationJobIdRequestSchema,
  generationSelectionSchema,
  generationStageLabel,
  lastOpenDesignSchema,
  projectIdRequestSchema,
  projectDefinitionDecisionRequestSchema,
  queueFocusedFeedbackRequestSchema,
  renameDesignRequestSchema,
  renameProjectRequestSchema,
  reconnectProjectRequestSchema,
  registerLinkedProjectRequestSchema,
  revisionPagesRequestSchema,
  locateFocusedTargetsRequestSchema,
  resolveFocusedTargetRequestSchema,
  removeFocusedFeedbackRequestSchema,
  savePageMetadataRequestSchema,
  saveProjectDesignDefinitionsRequestSchema,
  saveDesignSelectionRequestSchema,
  saveDraftRequestSchema,
  saveLayoutRequestSchema,
  selectRevisionRequestSchema,
  setEntryPageRequestSchema,
  setProjectDefinitionPromptSuppressedRequestSchema,
  submitFocusedFeedbackBatchRequestSchema,
  themeSchema,
  trashItemRequestSchema,
} from '../workspace/contracts.js'
import type { GenerationActivity } from '../workspace/contracts.js'
import { writeOfflineZip } from '../workspace/exportService.js'
import { GenerationQueue } from '../workspace/generationQueue.js'
import { PreviewContentServer } from '../workspace/previewServer.js'
import { ThumbnailCapturer } from '../workspace/thumbnailCapturer.js'
import { isAllowedPreviewNetworkUrl, isAllowedPreviewUrl } from '../workspace/previewPolicy.js'
import { WorkspaceService } from '../workspace/workspaceService.js'
import { WorkspaceStore } from '../workspace/store.js'
import { createDesignTitlePrompt, designTitleReferencePaths, fallbackDesignTitle, normalizeDesignTitle, selectLightweightMetadataSelection, shouldReplaceFallbackTitle } from '../workspace/designTitle.js'
import { createMockProjectDefinitionProposal, createProjectDefinitionProposalPrompt, parseProjectDefinitionProposal, selectProjectDefinitionAnalysisRoots } from '../workspace/projectDefinitionProposal.js'
import { shouldEnableUpdates, UpdateService } from '../update/updateService.js'

const developmentServerUrl = process.env.VITE_DEV_SERVER_URL
const testUserDataDirectory = process.env.OMNIDESIGN_USER_DATA_DIR
const developmentProviderEnabled = Boolean(developmentServerUrl || process.env.OMNIDESIGN_ENABLE_MOCK_PROVIDER === '1')
// Lets automated (e2e) runs suppress OS notifications so completing generations do not fire real
// Windows toasts during the test suite.
const notificationsSuppressed = process.env.OMNIDESIGN_DISABLE_NOTIFICATIONS === '1'
// Playwright can inspect and interact with hidden BrowserWindows. Keeping every test-owned window
// hidden prevents repeated launches and pop-outs from stealing focus from the user's desktop.
const automatedTestWindowsHidden = process.env.OMNIDESIGN_E2E_HIDE_WINDOWS === '1'
const providers = new ProviderService()
let mainWindow: BrowserWindow | null = null
let previewServer: PreviewContentServer | null = null
let thumbnailCapturer: ThumbnailCapturer | null = null
let popWindow: BrowserWindow | null = null
let popWindowDesignId: string | null = null
let workspace: WorkspaceService | null = null
let workspaceStore: WorkspaceStore | null = null
let generationQueue: GenerationQueue | null = null
let updateService: UpdateService | null = null
let closingAfterGenerationConfirmation = false
const lastPersistedStageByDesign = new Map<string, string>()

// Designs, their Git repositories, and the SQLite database live under the app's userData directory
// (on Windows that is %APPDATA%\Roaming\<app>\workspace). Tests point userData at a temp directory.
function resolveWorkspaceDirectory(): string {
  return path.join(app.getPath('userData'), 'workspace')
}

protocol.registerSchemesAsPrivileged([{
  scheme: 'omnidesign-preview',
  privileges: { standard: true, secure: true, supportFetchAPI: true },
}])

if (testUserDataDirectory) app.setPath('userData', testUserDataDirectory)

function isProviderPrompt(value: unknown): value is ProviderPrompt {
  if (typeof value !== 'object' || value === null) return false
  const request = value as Record<string, unknown>
  return isProviderId(request.providerId)
    && typeof request.requestId === 'string' && request.requestId.length > 0 && request.requestId.length <= 100
    && typeof request.modelId === 'string' && request.modelId.length > 0
    && (request.effort === undefined || typeof request.effort === 'string')
    && (request.resumeSessionId === undefined || (typeof request.resumeSessionId === 'string' && request.resumeSessionId.length > 0 && request.resumeSessionId.length <= 1_000))
    && typeof request.prompt === 'string' && request.prompt.length <= 100_000
}

async function generateDesignTitle(prompt: string, providerId: 'codex' | 'claude', modelId: string, effort: string | null, attachments: readonly import('../workspace/contracts.js').Attachment[]): Promise<string> {
  const fallback = fallbackDesignTitle(prompt)
  try {
    // Only ever contact the selected provider — never fan out to every installed CLI just to name a design.
    const status = await providers.discoverProvider(providerId)
    const selection = selectLightweightMetadataSelection(status ? [status] : [], providerId, { modelId, effort })
    const reply = await providers.prompt({
      requestId: randomUUID(),
      providerId,
      modelId: selection.modelId,
      ...(selection.effort ? { effort: selection.effort } : {}),
      prompt: createDesignTitlePrompt(prompt, attachments),
      referencePaths: designTitleReferencePaths(attachments),
    })
    return normalizeDesignTitle(reply.text, fallback)
  } catch {
    return fallback
  }
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'OmniDesign',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, '../preload/index.js'),
    },
  })

  window.once('ready-to-show', () => { if (!automatedTestWindowsHidden) window.show() })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  if (developmentServerUrl) {
    window.webContents.on('console-message', (event) => console.log(`[renderer:${event.level}] ${event.message}${event.sourceId ? ` (${event.sourceId}:${event.lineNumber})` : ''}`))
  }
  // The trusted renderer's only subframes are preview iframes. Keep a previewed page from navigating a
  // frame away to any non-preview URL (e.g. an external link click); the sandbox already blocks
  // top-level navigation and popups, this closes off in-frame navigation as defense in depth.
  window.webContents.on('will-frame-navigate', (event) => {
    if (!event.isMainFrame && !isAllowedPreviewUrl(event.url)) event.preventDefault()
  })

  if (developmentServerUrl) {
    void window.loadURL(developmentServerUrl)
  } else {
    void window.loadFile(path.join(__dirname, '../../dist-renderer/index.html'))
  }

  return window
}

function authorize(event: Electron.IpcMainInvokeEvent): void {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
    throw new Error('Unauthorized sender.')
  }
}

function requireWorkspace(): WorkspaceService {
  if (!workspace) throw new Error('Workspace is not ready.')
  return workspace
}

function requireWorkspaceStore(): WorkspaceStore {
  if (!workspaceStore) throw new Error('Workspace store is not ready.')
  return workspaceStore
}

function requireGenerationQueue(): GenerationQueue {
  if (!generationQueue) throw new Error('Generation queue is not ready.')
  return generationQueue
}

function sendGenerationActivity(activity: GenerationActivity): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('workspace:activity', activity)
}

function sendWorkspaceChanged(designId: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('workspace:changed', { designId })
}

// Persist a permanent, chronological record of the major generation milestones for the design's
// conversation history, then forward the live activity to the renderer. Consecutive activities that
// share a stage (for example the many streaming "generating" updates from an agent) collapse into a
// single milestone so the history stays readable.
function recordActivity(activity: GenerationActivity): void {
  const activityKey = `${activity.stage}\u0000${activity.detail}`
  if (workspaceStore && lastPersistedStageByDesign.get(activity.designId) !== activityKey) {
    lastPersistedStageByDesign.set(activity.designId, activityKey)
    try {
      workspaceStore.addGenerationStep(activity.designId, activity.stage, generationStageLabel(activity.stage), activity.detail || null)
    } catch {
      // The design may have been removed while a late activity arrived; the live event below is enough.
    }
  }
  // Notify only for background outcomes worth surfacing: completion, failure, and restart interruption.
  // A user-initiated cancel needs no toast, and nothing is announced while the window is focused (the
  // user is already watching this generation).
  const windowFocused = mainWindow != null && !mainWindow.isDestroyed() && mainWindow.isFocused()
  if (!notificationsSuppressed && workspaceStore?.getNotificationsEnabled() && Notification.isSupported() && !windowFocused && ['complete', 'failed', 'interrupted'].includes(activity.stage)) {
    const title = workspaceStore.getDesign(activity.designId)?.title ?? 'Design generation'
    new Notification({ title: 'OmniDesign', body: `${title}: ${activity.detail}` }).show()
  }
  sendGenerationActivity(activity)
}

function requirePreviewServer(): PreviewContentServer {
  if (!previewServer) throw new Error('Preview is not ready.')
  return previewServer
}

// The trusted renderer embeds preview URLs; frame-ancestors must name the renderer's own origin. In
// development that is the Vite dev-server origin, and in production the packaged renderer is a file:
// document.
function previewFrameAncestors(): string {
  if (!developmentServerUrl) return 'file:'
  try {
    return `${new URL(developmentServerUrl).origin} file:`
  } catch {
    return 'file:'
  }
}

// Pop the preview into a dedicated sandboxed window that loads the page over the preview scheme. The
// window shares the default session, so the registered token resolves through the same protocol handler.
function openPreviewPopOut(token: string, page: string): void {
  if (popWindow && !popWindow.isDestroyed()) {
    void popWindow.webContents.loadURL(`omnidesign-preview://revision/${token}/${page}`)
    if (!automatedTestWindowsHidden) popWindow.focus()
    return
  }
  const created = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 320,
    minHeight: 240,
    show: !automatedTestWindowsHidden,
    title: 'OmniDesign preview',
    backgroundColor: '#151315',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  popWindow = created
  created.setMenuBarVisibility(false)
  created.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  created.on('closed', () => {
    const designId = popWindowDesignId
    popWindow = null
    popWindowDesignId = null
    if (designId && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('preview:popped-in', { designId })
  })
  void created.webContents.loadURL(`omnidesign-preview://revision/${token}/${page}`)
}

function registerIpc(): void {
  ipcMain.handle('providers:discover', async (event) => {
    authorize(event)
    const discovered = await providers.discover()
    return developmentProviderEnabled
      ? [{ id: 'mock', name: 'Development provider', installed: true, authenticated: true, detail: 'Available for local development and automated testing.', models: [{ id: 'mock-v1', name: 'Mock v1', effortLevels: [] }] }, ...discovered]
      : discovered
  })
  ipcMain.handle('providers:prompt', (event, request: unknown) => {
    authorize(event)
    if (!isProviderPrompt(request)) throw new Error('Invalid provider request.')
    return providers.prompt(request, (activity) => {
      if (!event.sender.isDestroyed()) event.sender.send('providers:activity', activity)
    })
  })
  ipcMain.handle('workspace:list', (event) => {
    authorize(event)
    return requireWorkspace().listDesigns()
  })
  ipcMain.handle('workspace:get', (event, value: unknown) => {
    authorize(event)
    return requireWorkspace().getDesign(designIdRequestSchema.parse(value).designId)
  })
  ipcMain.handle('workspace:rename-design', (event, value: unknown) => {
    authorize(event)
    const request = renameDesignRequestSchema.parse(value)
    return requireWorkspace().renameDesign(request.designId, request.title)
  })
  ipcMain.handle('workspace:create', async (event, value: unknown) => {
    authorize(event)
    const request = createDesignRequestSchema.parse(value)
    const selection = { providerId: request.providerId, modelId: request.modelId, effort: request.effort ?? null }
    let target = { projectId: request.projectId ?? null, sourceProjectPath: request.sourceProjectPath ?? null }
    const hasCloneTarget = Boolean(request.cloneRemoteUrl || request.cloneDestinationDirectory)
    if (hasCloneTarget) {
      if (!request.cloneRemoteUrl || !request.cloneDestinationDirectory) throw new Error('Both a Git repository URL and destination folder are required to clone a project.')
      const project = await requireWorkspace().cloneProject(request.cloneRemoteUrl, request.cloneDestinationDirectory, (detail) => {
        if (!event.sender.isDestroyed()) event.sender.send('workspace:clone-activity', detail)
      })
      target = { projectId: project.id, sourceProjectPath: null }
    }
    if (request.providerId === 'mock') {
      const design = await requireWorkspace().createDesign(request.prompt, recordActivity, target, request.attachments)
      requireWorkspace().rememberSelection(design.id, selection)
      return requireWorkspace().getDesign(design.id) ?? design
    }
    const fallbackTitle = fallbackDesignTitle(request.prompt)
    const design = requireWorkspace().createAgentDesignShell(request.prompt, recordActivity, target, fallbackTitle)
    requireWorkspace().rememberSelection(design.id, selection)
    // The title is generated in the background, concurrently with the first generation. Flag it pending
    // so the workspace shows a spinner in place of the rename control until the generated title lands.
    requireWorkspace().setTitlePending(design.id, true)
    requireGenerationQueue().enqueue(design.id, request.prompt, request.providerId, request.modelId, request.effort, request.attachments)
    void generateDesignTitle(request.prompt, request.providerId, request.modelId, request.effort ?? null, request.attachments).then((title) => {
      const current = workspace?.getDesign(design.id)
      if (current && shouldReplaceFallbackTitle(current.title, fallbackTitle, title) && (current.sourceProjectPath || current.projectName === fallbackTitle)) {
        workspace?.renameDesign(design.id, title)
      }
    }).catch(() => undefined).finally(() => {
      // Whether the title landed, failed, or was superseded by a user edit, the pending state is over.
      workspace?.setTitlePending(design.id, false)
      sendWorkspaceChanged(design.id)
    })
    return requireWorkspace().getDesign(design.id) ?? design
  })
  ipcMain.handle('workspace:list-projects', (event) => {
    authorize(event)
    return requireWorkspace().listProjects()
  })
  ipcMain.handle('workspace:get-project', (event, value: unknown) => {
    authorize(event)
    return requireWorkspace().getProject(projectIdRequestSchema.parse(value).projectId)
  })
  ipcMain.handle('workspace:get-project-design-definitions', (event, value: unknown) => {
    authorize(event)
    return requireWorkspace().getProjectDesignDefinitionState(projectIdRequestSchema.parse(value).projectId)
  })
  ipcMain.handle('workspace:save-project-design-definitions', (event, value: unknown) => {
    authorize(event)
    const request = saveProjectDesignDefinitionsRequestSchema.parse(value)
    return requireWorkspace().saveProjectDesignDefinitions(request.projectId, request.definitions)
  })
  ipcMain.handle('workspace:propose-project-design-definitions', async (event, value: unknown) => {
    authorize(event)
    const request = proposeProjectDesignDefinitionsRequestSchema.parse(value)
    const projectContext = requireWorkspace().getProject(request.projectId)
    if (!projectContext) throw new Error('Project not found.')
    const { project, designs } = projectContext
    if (request.providerId === 'mock') return createMockProjectDefinitionProposal(project.name)
    const designRepositoryPaths = designs
      .filter((design) => Boolean(design.activeRevisionId))
      .map((design) => requireWorkspace().getDesignRepositoryPath(design.id))
    const analysisRoots = selectProjectDefinitionAnalysisRoots(project.sourceProjectPath, project.sourceAvailable, designRepositoryPaths)
    if (!analysisRoots) throw new Error('This project has no linked source or completed designs to analyze yet.')
    const reply = await providers.runAnalysisAgent({
      requestId: randomUUID(),
      providerId: request.providerId,
      modelId: request.modelId,
      ...(request.effort ? { effort: request.effort } : {}),
      workspacePath: analysisRoots.workspacePath,
      ...(analysisRoots.referencePaths.length ? { referencePaths: analysisRoots.referencePaths } : {}),
      prompt: createProjectDefinitionProposalPrompt(project.name),
      instructions: 'Inspect the original project and design repositories directly. Do not modify files. Return only the requested JSON object and no Markdown.',
    })
    return parseProjectDefinitionProposal(reply.text)
  })
  ipcMain.handle('workspace:set-project-definition-prompt-suppressed', (event, value: unknown) => {
    authorize(event)
    const request = setProjectDefinitionPromptSuppressedRequestSchema.parse(value)
    return requireWorkspace().setProjectDefinitionPromptSuppressed(request.projectId, request.suppressed)
  })
  ipcMain.handle('workspace:keep-project-design-definitions', (event, value: unknown) => {
    authorize(event)
    const request = projectDefinitionDecisionRequestSchema.parse(value)
    const design = requireWorkspace().keepProjectDesignDefinitions(request.designId, request.targetVersion)
    sendWorkspaceChanged(request.designId)
    return design
  })
  ipcMain.handle('workspace:apply-project-design-definitions', async (event, value: unknown) => {
    authorize(event)
    const request = projectDefinitionDecisionRequestSchema.parse(value)
    let design = await requireWorkspace().applyProjectDesignDefinitions(request.designId, request.targetVersion)
    if (design.definitionApplicationState === 'unavailable' && request.providerId && request.modelId) {
      const prompt = requireWorkspace().prepareAIProjectDefinitionApplication(request.designId, request.targetVersion)
      const job = requireGenerationQueue().enqueue(request.designId, prompt, request.providerId, request.modelId, request.effort, [], request.targetVersion)
      requireWorkspaceStore().startProjectDefinitionApplicationAttempt(request.designId, request.targetVersion, { mechanism: 'ai', generationJobId: job.id, providerId: request.providerId, modelId: request.modelId, effort: request.effort ?? null })
      design = requireWorkspace().getDesign(request.designId) ?? design
    }
    sendWorkspaceChanged(request.designId)
    return design
  })
  ipcMain.handle('workspace:apply-project-design-definitions-to-all', async (event, value: unknown) => {
    authorize(event)
    const request = applyProjectDefinitionsToAllRequestSchema.parse(value)
    const designs = await requireWorkspace().applyProjectDesignDefinitionsToAll(request.projectId, request.targetVersion)
    const availableProviders = await providers.discover()
    for (let index = 0; index < designs.length; index += 1) {
      const design = designs[index]
      if (design.definitionApplicationState !== 'unavailable' || design.lastSelection.providerId === 'mock') continue
      const available = availableProviders.some((provider) => provider.id === design.lastSelection.providerId && provider.installed && provider.authenticated && provider.models.some((model) => model.id === design.lastSelection.modelId))
      if (!available) continue
      const prompt = requireWorkspace().prepareAIProjectDefinitionApplication(design.id, request.targetVersion)
      const job = requireGenerationQueue().enqueue(design.id, prompt, design.lastSelection.providerId, design.lastSelection.modelId, design.lastSelection.effort, [], request.targetVersion)
      requireWorkspaceStore().startProjectDefinitionApplicationAttempt(design.id, request.targetVersion, { mechanism: 'ai', generationJobId: job.id, providerId: design.lastSelection.providerId, modelId: design.lastSelection.modelId, effort: design.lastSelection.effort })
      designs[index] = requireWorkspace().getDesign(design.id) ?? design
    }
    for (const design of designs) sendWorkspaceChanged(design.id)
    return designs
  })
  ipcMain.handle('workspace:rename-project', (event, value: unknown) => {
    authorize(event)
    const request = renameProjectRequestSchema.parse(value)
    return requireWorkspace().renameProject(request.projectId, request.name)
  })
  ipcMain.handle('workspace:associate-design', (event, value: unknown) => {
    authorize(event)
    const request = associateDesignRequestSchema.parse(value)
    return requireWorkspace().associateDesignWithProject(request.designId, request.projectId)
  })
  ipcMain.handle('workspace:duplicate-design', (event, value: unknown) => {
    authorize(event)
    return requireWorkspace().duplicateDesign(designIdRequestSchema.parse(value).designId)
  })
  ipcMain.handle('workspace:dismiss-adaptation', (event, value: unknown) => {
    authorize(event)
    const request = designIdRequestSchema.parse(value)
    requireWorkspace().setAdaptationPending(request.designId, false)
    return requireWorkspace().getDesign(request.designId)
  })
  ipcMain.handle('workspace:associate-and-restart', async (event, value: unknown) => {
    authorize(event)
    const request = associateDesignRequestSchema.parse(value)
    requireWorkspace().associateDesignWithProject(request.designId, request.projectId)
    // Restarting immediately regenerates in the new project's context, so there is no separate
    // "adapt to project?" decision left to make — clear the pending flag the move just raised.
    requireWorkspace().setAdaptationPending(request.designId, false)
    const job = requireWorkspace().getDesign(request.designId)?.generationJobs.find((candidate) => ['queued', 'running'].includes(candidate.state))
    if (!job) return requireWorkspace().getDesign(request.designId)
    await requireGenerationQueue().cancelAndWait(job.id)
    requireGenerationQueue().retry(job.id)
    return requireWorkspace().getDesign(request.designId)
  })
  ipcMain.handle('workspace:list-folders', (event) => { authorize(event); return requireWorkspace().listFolders() })
  ipcMain.handle('workspace:create-folder', (event, value: unknown) => {
    authorize(event)
    const request = createFolderRequestSchema.parse(value)
    return requireWorkspace().createFolder(request.name, request.parentFolderId ?? null)
  })
  ipcMain.handle('workspace:rename-folder', (event, value: unknown) => {
    authorize(event)
    const request = renameFolderRequestSchema.parse(value)
    return requireWorkspace().renameFolder(request.folderId, request.name)
  })
  ipcMain.handle('workspace:delete-folder', (event, value: unknown) => {
    authorize(event)
    requireWorkspace().deleteFolder(folderIdRequestSchema.parse(value).folderId)
  })
  ipcMain.handle('workspace:move-project-to-folder', (event, value: unknown) => {
    authorize(event)
    const request = moveProjectToFolderRequestSchema.parse(value)
    return requireWorkspace().moveProjectToFolder(request.projectId, request.folderId)
  })
  ipcMain.handle('workspace:list-tags', (event) => { authorize(event); return requireWorkspace().listTags() })
  ipcMain.handle('workspace:create-tag', (event, value: unknown) => {
    authorize(event)
    const request = createTagRequestSchema.parse(value)
    return requireWorkspace().createTag(request.name, request.color)
  })
  ipcMain.handle('workspace:delete-tag', (event, value: unknown) => {
    authorize(event)
    requireWorkspace().deleteTag(tagIdRequestSchema.parse(value).tagId)
  })
  ipcMain.handle('workspace:tag', (event, value: unknown) => {
    authorize(event)
    const request = tagTargetRequestSchema.parse(value)
    requireWorkspace().setTag(request.targetKind, request.targetId, request.tagId)
  })
  ipcMain.handle('workspace:untag', (event, value: unknown) => {
    authorize(event)
    const request = tagTargetRequestSchema.parse(value)
    requireWorkspace().removeTag(request.targetKind, request.targetId, request.tagId)
  })
  ipcMain.handle('workspace:list-trash', (event) => { authorize(event); return requireWorkspace().listTrash() })
  ipcMain.handle('workspace:clone-project', async (event, value: unknown) => {
    authorize(event)
    const request = cloneProjectRequestSchema.parse(value)
    return requireWorkspace().cloneProject(request.remoteUrl, request.destinationPath, (detail) => {
      if (!event.sender.isDestroyed()) event.sender.send('workspace:clone-activity', detail)
    })
  })
  ipcMain.handle('workspace:register-linked-project', (event, value: unknown) => {
    authorize(event)
    return requireWorkspace().registerLinkedProject(registerLinkedProjectRequestSchema.parse(value).sourceProjectPath)
  })
  ipcMain.handle('workspace:reconnect-project', (event, value: unknown) => {
    authorize(event)
    const request = reconnectProjectRequestSchema.parse(value)
    return requireWorkspace().reconnectProject(request.projectId, request.sourceProjectPath)
  })
  ipcMain.handle('workspace:convert-project-to-standalone', (event, value: unknown) => {
    authorize(event); return requireWorkspace().convertProjectToStandalone(projectIdRequestSchema.parse(value).projectId)
  })
  ipcMain.handle('workspace:trash', async (event, value: unknown) => {
    authorize(event)
    const request = trashItemRequestSchema.parse(value)
    const designs = request.kind === 'project'
      ? requireWorkspace().getProject(request.id)?.designs ?? []
      : [requireWorkspace().getDesign(request.id)].filter((design): design is NonNullable<typeof design> => design !== null)
    const activeJobs = designs.flatMap((design) => design.generationJobs).filter((job) => job.state === 'queued' || job.state === 'running')
    if (activeJobs.length) {
      const choice = dialog.showMessageBoxSync(mainWindow!, {
        type: 'warning',
        title: 'Remove active work?',
        message: `${activeJobs.length} generation${activeJobs.length === 1 ? '' : 's'} will be cancelled before this item moves to Trash.`,
        detail: 'The source folder is not affected. Partial output and diagnostics remain available in the retained design workspace.',
        buttons: ['Keep working', 'Cancel generations and remove'],
        defaultId: 0,
        cancelId: 0,
      })
      if (choice !== 1) return { cancelled: true }
      await Promise.all(activeJobs.map((job) => requireGenerationQueue().cancelAndWait(job.id)))
    }
    if (request.kind === 'project') requireWorkspace().moveProjectToTrash(request.id)
    else requireWorkspace().moveDesignToTrash(request.id)
    return { cancelled: false }
  })
  ipcMain.handle('workspace:restore-trash', (event, value: unknown) => {
    authorize(event)
    const request = trashItemRequestSchema.parse(value)
    return requireWorkspace().restoreTrashItem(request.kind, request.id)
  })
  ipcMain.handle('workspace:purge-trash', (event, value: unknown) => {
    authorize(event)
    const request = trashItemRequestSchema.parse(value)
    if (popWindow && !popWindow.isDestroyed()) popWindow.destroy()
    popWindow = null
    requireWorkspace().purgeTrashItem(request.kind, request.id)
  })
  const validateCurrentFocusedTarget = (designId: string, target: import('../workspace/contracts.js').FocusedTarget) => {
    const design = requireWorkspace().getDesign(designId)
    if (!design
      || target.designId !== designId
      || design.activeRevisionId !== target.revisionId
      || design.selectedRevisionId !== target.revisionId
      || !requirePreviewServer().validatesFocusedTarget(target)) {
      throw new Error('The selected element is stale or does not belong to the current design revision.')
    }
  }
  ipcMain.handle('workspace:generate', (event, value: unknown) => {
    authorize(event)
    const request = generateRequestSchema.parse(value)
    if (request.focusedTarget) validateCurrentFocusedTarget(request.designId, request.focusedTarget)
    requireWorkspace().rememberSelection(request.designId, { providerId: request.providerId, modelId: request.modelId, effort: request.effort ?? null })
    requireGenerationQueue().enqueue(request.designId, request.prompt, request.providerId, request.modelId, request.effort, request.attachments, null, request.focusedTarget ?? null)
    return requireWorkspace().getDesign(request.designId)
  })
  ipcMain.handle('workspace:list-focused-feedback', (event, value: unknown) => {
    authorize(event)
    return requireWorkspaceStore().listFocusedFeedback(designIdRequestSchema.parse(value).designId)
  })
  ipcMain.handle('workspace:queue-focused-feedback', (event, value: unknown) => {
    authorize(event)
    const request = queueFocusedFeedbackRequestSchema.parse(value)
    validateCurrentFocusedTarget(request.designId, request.target)
    return requireWorkspaceStore().queueFocusedFeedback(request.designId, request.comment, request.target)
  })
  ipcMain.handle('workspace:remove-focused-feedback', (event, value: unknown) => {
    authorize(event)
    const request = removeFocusedFeedbackRequestSchema.parse(value)
    return requireWorkspaceStore().removeFocusedFeedback(request.designId, request.feedbackId)
  })
  ipcMain.handle('workspace:submit-focused-feedback-batch', (event, value: unknown) => {
    authorize(event)
    const request = submitFocusedFeedbackBatchRequestSchema.parse(value)
    const byId = new Map(requireWorkspaceStore().listFocusedFeedback(request.designId).map((item) => [item.id, item]))
    const feedback = request.feedbackIds.map((id) => byId.get(id))
    if (feedback.some((item) => !item)) throw new Error('Queued focused feedback changed before it could be submitted.')
    const resolved = feedback.map((item) => item!)
    for (const item of resolved) validateCurrentFocusedTarget(request.designId, item.target)
    requireWorkspace().rememberSelection(request.designId, { providerId: request.providerId, modelId: request.modelId, effort: request.effort ?? null })
    const prompt = `Apply ${resolved.length} queued focused edit${resolved.length === 1 ? '' : 's'}.`
    requireGenerationQueue().enqueue(request.designId, prompt, request.providerId, request.modelId, request.effort, [], null, null, resolved)
    return requireWorkspace().getDesign(request.designId)
  })
  ipcMain.handle('workspace:cancel-generation', (event, value: unknown) => {
    authorize(event)
    return requireGenerationQueue().cancel(generationJobIdRequestSchema.parse(value).jobId)
  })
  ipcMain.handle('workspace:remove-generation', (event, value: unknown) => {
    authorize(event)
    return requireGenerationQueue().remove(generationJobIdRequestSchema.parse(value).jobId)
  })
  ipcMain.handle('workspace:retry-generation', (event, value: unknown) => {
    authorize(event)
    return requireGenerationQueue().retry(generationJobIdRequestSchema.parse(value).jobId)
  })
  ipcMain.handle('workspace:choose-project-folder', async (event) => {
    authorize(event)
    const selection = await dialog.showOpenDialog(mainWindow!, { properties: ['openDirectory'] })
    return selection.canceled ? null : selection.filePaths[0] ?? null
  })
  ipcMain.handle('workspace:continue-generation', (event, value: unknown) => {
    authorize(event)
    return requireGenerationQueue().continue(generationJobIdRequestSchema.parse(value).jobId)
  })
  ipcMain.handle('workspace:resume-generation-queue', (event, value: unknown) => {
    authorize(event)
    const designId = designIdRequestSchema.parse(value).designId
    requireGenerationQueue().resume(designId)
    return requireWorkspace().getDesign(designId)
  })
  ipcMain.handle('workspace:choose-attachments', async (event, value: unknown) => {
    authorize(event)
    const { kind } = attachmentPickerRequestSchema.parse(value)
    const selection = await dialog.showOpenDialog(mainWindow!, { properties: kind === 'files' ? ['openFile', 'multiSelections'] : ['openDirectory'] })
    if (selection.canceled) return []
    return selection.filePaths.flatMap((attachmentPath) => {
      try {
        const stats = statSync(attachmentPath)
        return [{ id: randomUUID(), path: attachmentPath, name: path.basename(attachmentPath), kind: stats.isDirectory() ? 'folder' as const : 'file' as const, size: stats.isDirectory() ? null : stats.size, modifiedAt: stats.mtime.toISOString(), selectedAt: new Date().toISOString(), status: 'available' as const }]
      } catch { return [] }
    })
  })
  ipcMain.handle('workspace:open-attachment', async (event, value: unknown) => {
    authorize(event)
    const attachment = attachmentSchema.parse(value)
    if (!statSync(attachment.path).isFile() && !statSync(attachment.path).isDirectory()) throw new Error('Attachment is no longer available.')
    const error = await shell.openPath(attachment.path)
    if (error) throw new Error(error)
  })
  ipcMain.handle('workspace:select-revision', (event, value: unknown) => {
    authorize(event)
    const request = selectRevisionRequestSchema.parse(value)
    return requireWorkspace().selectRevision(request.designId, request.revisionId)
  })
  ipcMain.handle('workspace:compare-revisions', (event, value: unknown) => {
    authorize(event)
    const request = compareRevisionsRequestSchema.parse(value)
    return requireWorkspace().compareRevisions(request.designId, request.baseRevisionId, request.targetRevisionId)
  })
  ipcMain.handle('workspace:restore-revision', (event, value: unknown) => {
    authorize(event)
    const request = selectRevisionRequestSchema.parse(value)
    return requireWorkspace().restoreRevision(request.designId, request.revisionId)
  })
  ipcMain.handle('workspace:save-draft', (event, value: unknown) => {
    authorize(event)
    const request = saveDraftRequestSchema.parse(value)
    requireWorkspace().saveDraft(request.designId, request.draft, request.attachments)
  })
  ipcMain.handle('workspace:save-layout', (event, value: unknown) => {
    authorize(event)
    const request = saveLayoutRequestSchema.parse(value)
    requireWorkspace().saveLayout(request.designId, request.layout)
  })
  ipcMain.handle('settings:get-theme', (event) => {
    authorize(event)
    return requireWorkspace().getTheme()
  })
  ipcMain.handle('settings:save-theme', (event, value: unknown) => {
    authorize(event)
    requireWorkspace().saveTheme(themeSchema.parse(value))
  })
  ipcMain.handle('settings:get-generation-defaults', (event) => {
    authorize(event)
    return requireWorkspace().getGenerationDefaults()
  })
  ipcMain.handle('settings:save-generation-defaults', (event, value: unknown) => {
    authorize(event)
    requireWorkspace().saveGenerationDefaults(generationSelectionSchema.parse(value))
  })
  ipcMain.handle('settings:get-last-open-design', (event) => {
    authorize(event)
    return requireWorkspace().getLastOpenDesignId()
  })
  ipcMain.handle('settings:save-last-open-design', (event, value: unknown) => {
    authorize(event)
    requireWorkspace().saveLastOpenDesignId(lastOpenDesignSchema.parse(value))
  })
  ipcMain.handle('workspace:save-design-selection', (event, value: unknown) => {
    authorize(event)
    const request = saveDesignSelectionRequestSchema.parse(value)
    requireWorkspace().saveDesignSelection(request.designId, request.selection)
  })
  ipcMain.handle('preview:register', (event, value: unknown) => {
    authorize(event)
    const request = previewRegisterRequestSchema.parse(value)
    if (!requireWorkspace().getDesign(request.designId)) return null
    const files = requireWorkspace().getRevisionFiles(request.designId, request.revisionId)
    const { pages, entryPagePath } = requireWorkspace().getRevisionPages(request.designId, request.revisionId)
    const token = requirePreviewServer().register(request.designId, request.revisionId, files)
    return { token, pages, entryPagePath }
  })
  ipcMain.handle('preview:resolve-focused-target', (event, value: unknown) => {
    authorize(event)
    const request = resolveFocusedTargetRequestSchema.parse(value)
    const design = requireWorkspace().getDesign(request.designId)
    if (!design || design.activeRevisionId !== request.revisionId || design.selectedRevisionId !== request.revisionId) return null
    return requirePreviewServer().resolveFocusedTarget(request)
  })
  ipcMain.handle('preview:locate-focused-targets', (event, value: unknown) => {
    authorize(event)
    const request = locateFocusedTargetsRequestSchema.parse(value)
    const design = requireWorkspace().getDesign(request.designId)
    if (!design || design.selectedRevisionId !== request.revisionId) return []
    return requirePreviewServer().locateFocusedTargets(request)
  })
  ipcMain.handle('preview:report-diagnostic', (event, value: unknown) => {
    authorize(event)
    const request = previewDiagnosticReportSchema.parse(value)
    try {
      workspaceStore?.addPreviewDiagnostic(request.designId, request.revisionId, { kind: 'console', ...request.diagnostic })
    } catch {
      return
    }
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('preview:diagnostic', { designId: request.designId, revisionId: request.revisionId })
  })
  ipcMain.handle('preview:capture', async (event, value: unknown) => {
    authorize(event)
    const request = previewCaptureRequestSchema.parse(value)
    if (!thumbnailCapturer || !requireWorkspace().getDesign(request.designId)) return false
    let files: import('../workspace/designRepository.js').RevisionFiles
    let entryPage: string
    try {
      files = requireWorkspace().getRevisionFiles(request.designId, request.revisionId)
      entryPage = requireWorkspace().getRevisionPages(request.designId, request.revisionId).entryPagePath ?? 'index.html'
    } catch {
      return false
    }
    const result = await thumbnailCapturer.capture(request.designId, request.revisionId, files, entryPage)
    if (!result.checked) return false
    try {
      if (result.png) workspaceStore?.saveThumbnail(request.designId, request.revisionId, result.png)
      workspaceStore?.saveRevisionQualityReport(request.designId, request.revisionId, result.findings)
    } catch {
      return false
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (result.png) mainWindow.webContents.send('preview:thumbnail', { designId: request.designId, revisionId: request.revisionId })
      mainWindow.webContents.send('preview:diagnostic', { designId: request.designId, revisionId: request.revisionId })
    }
    sendWorkspaceChanged(request.designId)
    return true
  })
  ipcMain.handle('preview:pop-out', (event, value: unknown) => {
    authorize(event)
    const request = previewPopOutRequestSchema.parse(value)
    if (!requireWorkspace().getDesign(request.designId)) return
    const files = requireWorkspace().getRevisionFiles(request.designId, request.revisionId)
    const page = request.page ?? requireWorkspace().getRevisionPages(request.designId, request.revisionId).entryPagePath ?? 'index.html'
    const token = requirePreviewServer().register(request.designId, request.revisionId, files)
    popWindowDesignId = request.designId
    openPreviewPopOut(token, page)
  })
  ipcMain.handle('preview:close-pop-out', (event) => {
    authorize(event)
    popWindowDesignId = null
    if (popWindow && !popWindow.isDestroyed()) popWindow.destroy()
    popWindow = null
  })
  ipcMain.handle('workspace:export', async (event, value: unknown) => {
    authorize(event)
    const request = exportRequestSchema.parse(value)
    const design = requireWorkspace().getDesign(request.designId)
    if (!design || !mainWindow) throw new Error('Design not found.')
    const safeTitle = design.title.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'design'
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export offline design',
      defaultPath: `${safeTitle}.zip`,
      filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    const { entryPagePath } = requireWorkspace().getRevisionPages(request.designId, request.revisionId)
    writeOfflineZip(requireWorkspace().getRevisionFiles(request.designId, request.revisionId), result.filePath, entryPagePath)
    return { canceled: false, filePath: result.filePath }
  })
  ipcMain.handle('workspace:revision-pages', (event, value: unknown) => {
    authorize(event)
    const request = revisionPagesRequestSchema.parse(value)
    return requireWorkspace().getRevisionPages(request.designId, request.revisionId)
  })
  ipcMain.handle('workspace:set-entry-page', (event, value: unknown) => {
    authorize(event)
    const request = setEntryPageRequestSchema.parse(value)
    return requireWorkspace().setDesignEntryPage(request.designId, request.entryPagePath)
  })
  ipcMain.handle('workspace:save-page-metadata', (event, value: unknown) => {
    authorize(event)
    const request = savePageMetadataRequestSchema.parse(value)
    return requireWorkspace().saveDesignPageMetadata(request.designId, request.path, request.title, request.order)
  })
}

app.enableSandbox()

void app.whenReady().then(() => {
  const store = new WorkspaceStore(resolveWorkspaceDirectory())
  workspaceStore = store
  workspace = new WorkspaceService(store)
  generationQueue = new GenerationQueue(
    store,
    async (job, signal, onActivity) => {
      // Make sure the repository is at the head of the main timeline before generating, in case the
      // user was viewing (and had checked out) an earlier revision.
      if (job.mode === 'fresh') requireWorkspace().prepareGenerationWorkspace(job.designId)
      if (job.providerId === 'mock') {
        await requireWorkspace().generate(job.designId, job.prompt, onActivity, undefined, false, signal, 3)
        return
      }
      if (signal.aborted) throw new Error('Generation was cancelled.')
      let agentPrompt = job.mode === 'continue' ? `Continue the interrupted design task from the retained partial workspace. Original request: ${job.prompt}` : job.prompt
      // A retry normally resumes the provider thread that already received the new-design context.
      // Re-send it only when there is no resumable session (for example, the first attempt failed
      // before the provider returned a session id).
      const storedSession = store.getDesignProviderSession(job.designId)
      if (job.mode === 'fresh' && !job.providerSessionId && !storedSession) {
        const definitionContext = requireWorkspace().getInitialProjectDefinitionPromptContext(job.designId)
        if (definitionContext) agentPrompt = `${agentPrompt}\n\n${definitionContext}`
      }
      if (job.focusedFeedback?.length) agentPrompt = createFocusedFeedbackBatchPrompt(job.focusedFeedback)
      else if (job.focusedTarget) agentPrompt = createFocusedEditPrompt(agentPrompt, job.focusedTarget)
      // Resume the design's own provider conversation when the selected provider matches the stored
      // session; otherwise this is a fresh session (first prompt, a provider switch, or a stale session).
      let providerSessionId = job.providerSessionId ?? (storedSession && storedSession.providerId === job.providerId ? storedSession.sessionId : undefined)
      // When starting fresh, give the agent a recap of the conversation so far so it is not blind to it.
      // The last message is the current prompt (added at enqueue), so it is excluded from the recap.
      const conversationRecap = providerSessionId ? '' : buildConversationRecap((store.getDesign(job.designId)?.messages ?? []).slice(0, -1))
      const rememberSession = (sessionId: string) => {
        if (!sessionId || sessionId === providerSessionId) return
        providerSessionId = sessionId
        store.saveGenerationJobSession(job.id, sessionId)
        store.saveDesignProviderSession(job.designId, job.providerId, sessionId)
      }
      for (let attempt = 0; attempt < 4; attempt += 1) {
        onActivity({ designId: job.designId, stage: attempt === 0 ? 'generating' : 'repairing', detail: attempt === 0 ? 'Starting the design agent.' : `Making improvements (round ${attempt} of 3).` })
        // Build the agent's conversation from the stream: accumulate consecutive text, and when any
        // other kind of event arrives (a tool action, a result, etc.) push the connected text as one
        // message and move on. This keeps each thing the agent says as a readable message instead of a
        // flood of per-token entries. The store de-dupes so the final reply is not repeated.
        let agentText = ''
        let lastFlushed = ''
        const flushAgentMessage = () => {
          const buffered = agentText.trim()
          agentText = ''
          if (!buffered) return
          const message = normalizeAgentReply(buffered)
          if (!message || message === lastFlushed) return
          lastFlushed = message
          try {
            store.addAssistantResponse(job.designId, message)
            sendWorkspaceChanged(job.designId)
          } catch { /* the design may have been removed mid-stream */ }
        }
        const reply = await providers.runDesignAgent({
          requestId: `${job.id}-${attempt}`,
          providerId: job.providerId,
          modelId: job.modelId,
          ...(job.effort ? { effort: job.effort } : {}),
          prompt: agentPrompt,
          signal,
          workspacePath: requireWorkspace().getDesignRepositoryPath(job.designId),
          attachments: job.attachments,
          sourceProjectPath: requireWorkspace().getDesign(job.designId)?.sourceProjectPath ?? null,
          ...(providerSessionId ? { resumeSessionId: providerSessionId } : {}),
          ...(conversationRecap ? { conversationRecap } : {}),
        }, (activity) => {
          if (activity.sessionId) rememberSession(activity.sessionId)
          if (activity.kind === 'text') { agentText += activity.detail ?? ''; return }
          // A different kind of event closes the current message: flush it, then log the milestone.
          flushAgentMessage()
          // Provider lifecycle chatter ('status': init/hooks/thinking) is internal noise; tool actions,
          // results, and diagnostics remain as milestones.
          if (activity.kind === 'status') return
          onActivity({ designId: job.designId, stage: attempt === 0 ? 'generating' : 'repairing', detail: activity.detail ?? activity.label })
        })
        flushAgentMessage()
        if (reply.sessionId) rememberSession(reply.sessionId)
        if (signal.aborted) throw new Error('Generation was cancelled.')
        const invalidCount = requireWorkspace().getDesign(job.designId)?.invalidCandidates.length ?? 0
        const revisionReason = job.definitionTargetVersion ? `Apply project definitions version ${job.definitionTargetVersion}` : job.prompt
        const priorRevisionId = requireWorkspace().getDesign(job.designId)?.activeRevisionId ?? null
        const saved = await requireWorkspace().saveAgentWorkspaceResult(job.designId, revisionReason, reply.providerId, reply.modelId, reply.response, onActivity, attempt < 3, job.definitionTargetVersion)
        if (saved.invalidCandidates.length === invalidCount) {
          if (job.definitionTargetVersion) {
            store.completeProjectDefinitionApplication(job.designId, job.definitionTargetVersion)
            store.finishProjectDefinitionApplicationAttemptForJob(job.id, 'completed', null, saved.activeRevisionId !== priorRevisionId ? saved.activeRevisionId : null)
          }
          return
        }
        const diagnostic = saved.invalidCandidates.at(-1)?.diagnostic ?? 'The candidate did not pass validation.'
        agentPrompt = `Repair the current design in place and finish the original request. Validation feedback: ${diagnostic}`
        if (job.focusedFeedback?.length) agentPrompt = createFocusedFeedbackBatchPrompt(job.focusedFeedback)
        else if (job.focusedTarget) agentPrompt = createFocusedEditPrompt(agentPrompt, job.focusedTarget)
      }
    },
    recordActivity,
  )
  generationQueue.recoverAfterRestart()
  // CSP is the first preview egress boundary; the default-session request filter independently
  // enforces the same host allowlist so a malformed or browser-misinterpreted resource tag still
  // cannot reach an arbitrary host. Development keeps the exact Vite renderer origin available.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    callback({ cancel: !isAllowedPreviewNetworkUrl(details.url, developmentServerUrl) })
  })
  previewServer = new PreviewContentServer(session.defaultSession, previewFrameAncestors())
  thumbnailCapturer = new ThumbnailCapturer(session.defaultSession, previewServer)
  mainWindow = createMainWindow()
  registerIpc()
  updateService = new UpdateService({
    enabled: shouldEnableUpdates(app.isPackaged, process.platform),
    async promptForRestart(version) {
      if (!mainWindow || mainWindow.isDestroyed()) return false
      const activeJobs = store.listGenerationJobs(['queued', 'running'])
      const detail = activeJobs.length > 0
        ? `${activeJobs.length} active generation${activeJobs.length === 1 ? '' : 's'} will be interrupted and can be continued after OmniDesign restarts.`
        : 'Restart now to apply the update, or choose Later to install it when you next quit OmniDesign.'
      const result = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update ready',
        message: `OmniDesign ${version} is ready to install.`,
        detail,
        buttons: ['Restart and update', 'Later'],
        defaultId: activeJobs.length > 0 ? 1 : 0,
        cancelId: 1,
      })
      return result.response === 0
    },
    beforeInstall() {
      closingAfterGenerationConfirmation = true
      store.markGenerationJobsInterrupted()
    },
  })
  updateService.start()

  mainWindow.on('closed', () => {
    if (popWindow && !popWindow.isDestroyed()) popWindow.destroy()
    popWindow = null
    mainWindow = null
  })
  ipcMain.handle('settings:get-notifications-enabled', (event) => {
    authorize(event)
    return requireWorkspace().getNotificationsEnabled()
  })
  ipcMain.handle('settings:save-notifications-enabled', (event, value: unknown) => {
    authorize(event)
    requireWorkspace().saveNotificationsEnabled(Boolean(value))
  })
  ipcMain.handle('settings:get-generation-detail', (event) => { authorize(event); return requireWorkspace().getGenerationDetail() })
  ipcMain.handle('settings:save-generation-detail', (event, value: unknown) => {
    authorize(event)
    if (value !== 'full' && value !== 'concise') throw new Error('Generation detail must be full or concise.')
    requireWorkspace().saveGenerationDetail(value)
  })
  mainWindow.on('close', (event) => {
    const activeJobs = store.listGenerationJobs(['queued', 'running'])
    if (closingAfterGenerationConfirmation || activeJobs.length === 0) return
    event.preventDefault()
    const choice = dialog.showMessageBoxSync(mainWindow!, {
      type: 'warning',
      title: 'Interrupt active generations?',
      message: `${activeJobs.length} generation${activeJobs.length === 1 ? '' : 's'} will be interrupted.`,
      detail: 'Partial work and diagnostics will be retained so you can Continue or Retry after reopening OmniDesign.',
      buttons: ['Keep working', 'Interrupt and close'],
      defaultId: 0,
      cancelId: 0,
    })
    if (choice !== 1) return
    closingAfterGenerationConfirmation = true
    store.markGenerationJobsInterrupted()
    mainWindow?.close()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      previewServer ??= new PreviewContentServer(session.defaultSession, previewFrameAncestors())
      thumbnailCapturer ??= new ThumbnailCapturer(session.defaultSession, previewServer)
      mainWindow = createMainWindow()
    }
  })
}).catch((error: unknown) => {
  console.error('OmniDesign failed to initialize.', error)
  app.exit(1)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  updateService?.stop()
  generationQueue?.recoverAfterRestart()
})
