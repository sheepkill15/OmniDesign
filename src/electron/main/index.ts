import { app, BrowserWindow, dialog, ipcMain, Notification, protocol, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import path from 'node:path'
import { isProviderId, ProviderService } from '../provider/providerService.js'
import type { ProviderPrompt } from '../provider/types.js'
import {
  createDesignRequestSchema,
  attachmentSchema,
  attachmentPickerRequestSchema,
  associateDesignRequestSchema,
  cloneProjectRequestSchema,
  designIdRequestSchema,
  exportRequestSchema,
  generateRequestSchema,
  generationJobIdRequestSchema,
  generationSelectionSchema,
  generationStageLabel,
  previewRequestSchema,
  projectIdRequestSchema,
  renameDesignRequestSchema,
  renameProjectRequestSchema,
  reconnectProjectRequestSchema,
  registerLinkedProjectRequestSchema,
  saveDesignSelectionRequestSchema,
  saveDraftRequestSchema,
  saveLayoutRequestSchema,
  selectRevisionRequestSchema,
  themeSchema,
  trashItemRequestSchema,
} from '../workspace/contracts.js'
import type { GenerationActivity } from '../workspace/contracts.js'
import { writeOfflineZip } from '../workspace/exportService.js'
import { GenerationQueue } from '../workspace/generationQueue.js'
import { PreviewController } from '../workspace/previewController.js'
import { WorkspaceService } from '../workspace/workspaceService.js'
import { WorkspaceStore } from '../workspace/store.js'
import { createDesignTitlePrompt, designTitleReferencePaths, fallbackDesignTitle, normalizeDesignTitle, selectLightweightMetadataSelection, shouldReplaceFallbackTitle } from '../workspace/designTitle.js'

const developmentServerUrl = process.env.VITE_DEV_SERVER_URL
const testUserDataDirectory = process.env.OMNIDESIGN_USER_DATA_DIR
const developmentProviderEnabled = Boolean(developmentServerUrl || process.env.OMNIDESIGN_ENABLE_MOCK_PROVIDER === '1')
const providers = new ProviderService()
let mainWindow: BrowserWindow | null = null
let preview: PreviewController | null = null
let workspace: WorkspaceService | null = null
let workspaceStore: WorkspaceStore | null = null
let generationQueue: GenerationQueue | null = null
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
    const selection = selectLightweightMetadataSelection(await providers.discover(), providerId, { modelId, effort })
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

  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

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
  if (workspaceStore?.getNotificationsEnabled() && Notification.isSupported() && !windowFocused && ['complete', 'failed', 'interrupted'].includes(activity.stage)) {
    const title = workspaceStore.getDesign(activity.designId)?.title ?? 'Design generation'
    new Notification({ title: 'OmniDesign', body: `${title}: ${activity.detail}` }).show()
  }
  sendGenerationActivity(activity)
}

function createPreview(window: BrowserWindow, store: WorkspaceStore): PreviewController {
  return new PreviewController(
    window,
    (designId, revisionId, diagnostic) => {
      try {
        store.addPreviewDiagnostic(designId, revisionId, diagnostic)
      } catch {
        return
      }
      if (!window.isDestroyed()) window.webContents.send('preview:diagnostic', { designId, revisionId })
    },
    (designId, revisionId, png) => {
      try {
        store.saveThumbnail(designId, revisionId, png)
      } catch {
        return
      }
      if (!window.isDestroyed()) window.webContents.send('preview:thumbnail', { designId, revisionId })
    },
    (designId) => {
      if (!window.isDestroyed()) window.webContents.send('preview:popped-in', { designId })
    },
  )
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
  ipcMain.handle('workspace:associate-and-restart', async (event, value: unknown) => {
    authorize(event)
    const request = associateDesignRequestSchema.parse(value)
    requireWorkspace().associateDesignWithProject(request.designId, request.projectId)
    const job = requireWorkspace().getDesign(request.designId)?.generationJobs.find((candidate) => ['queued', 'running'].includes(candidate.state))
    if (!job) return requireWorkspace().getDesign(request.designId)
    await requireGenerationQueue().cancelAndWait(job.id)
    requireGenerationQueue().retry(job.id)
    return requireWorkspace().getDesign(request.designId)
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
    preview?.discard()
    requireWorkspace().purgeTrashItem(request.kind, request.id)
  })
  ipcMain.handle('workspace:generate', (event, value: unknown) => {
    authorize(event)
    const request = generateRequestSchema.parse(value)
    requireWorkspace().rememberSelection(request.designId, { providerId: request.providerId, modelId: request.modelId, effort: request.effort ?? null })
    requireGenerationQueue().enqueue(request.designId, request.prompt, request.providerId, request.modelId, request.effort, request.attachments)
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
  ipcMain.handle('workspace:save-design-selection', (event, value: unknown) => {
    authorize(event)
    const request = saveDesignSelectionRequestSchema.parse(value)
    requireWorkspace().saveDesignSelection(request.designId, request.selection)
  })
  ipcMain.handle('preview:show', (event, value: unknown) => {
    authorize(event)
    const request = previewRequestSchema.parse(value)
    if (!requireWorkspace().getDesign(request.designId)) return
    const files = requireWorkspace().getRevisionFiles(request.designId, request.revisionId)
    preview?.show(request.designId, request.revisionId, files, request.bounds)
  })
  ipcMain.handle('preview:resize', (event, value: unknown) => {
    authorize(event)
    preview?.resize(previewRequestSchema.shape.bounds.parse(value))
  })
  ipcMain.handle('preview:pop-out', (event, value: unknown) => {
    authorize(event)
    const request = selectRevisionRequestSchema.parse(value)
    if (!requireWorkspace().getDesign(request.designId)) return
    const files = requireWorkspace().getRevisionFiles(request.designId, request.revisionId)
    preview?.popOut(request.designId, request.revisionId, files)
  })
  ipcMain.handle('preview:hide', (event) => {
    authorize(event)
    preview?.hide()
  })
  ipcMain.handle('preview:set-suspended', (event, value: unknown) => {
    authorize(event)
    preview?.setSuspended(value === true)
  })
  ipcMain.handle('preview:freeze', (event) => {
    authorize(event)
    return preview?.freeze() ?? null
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
    writeOfflineZip(requireWorkspace().getRevisionFiles(request.designId, request.revisionId), result.filePath)
    return { canceled: false, filePath: result.filePath }
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
      let providerSessionId = job.providerSessionId ?? undefined
      for (let attempt = 0; attempt < 4; attempt += 1) {
        onActivity({ designId: job.designId, stage: attempt === 0 ? 'generating' : 'repairing', detail: attempt === 0 ? `Starting ${job.providerId} in the design's Git repository.` : `Starting repair ${attempt} of 3.` })
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
        }, (activity) => {
          if (activity.sessionId && activity.sessionId !== providerSessionId) {
            providerSessionId = activity.sessionId
            store.saveGenerationJobSession(job.id, activity.sessionId)
          }
          // Streamed response tokens ('text') are raw partial output — JSON, for the agent path — and
          // are captured whole in the final assistant message. Logging each as its own milestone flooded
          // the conversation with one entry per token and triggered a renderer refresh per token. Keep
          // only meaningful milestones (tool actions, results, status, diagnostics) in the activity log.
          if (activity.kind === 'text') return
          onActivity({ designId: job.designId, stage: attempt === 0 ? 'generating' : 'repairing', detail: activity.detail ?? activity.label })
        })
        if (reply.sessionId && reply.sessionId !== providerSessionId) {
          providerSessionId = reply.sessionId
          store.saveGenerationJobSession(job.id, reply.sessionId)
        }
        if (signal.aborted) throw new Error('Generation was cancelled.')
        const invalidCount = requireWorkspace().getDesign(job.designId)?.invalidCandidates.length ?? 0
        const saved = await requireWorkspace().saveAgentWorkspaceResult(job.designId, job.prompt, reply.providerId, reply.modelId, reply.response, onActivity, attempt < 3)
        if (saved.invalidCandidates.length === invalidCount) return
        const diagnostic = saved.invalidCandidates.at(-1)?.diagnostic ?? 'The candidate did not pass validation.'
        agentPrompt = `Repair the current index.html in place and finish the original request. Validation feedback: ${diagnostic}`
      }
    },
    recordActivity,
  )
  generationQueue.recoverAfterRestart()
  mainWindow = createMainWindow()
  preview = createPreview(mainWindow, store)
  registerIpc()

  mainWindow.on('closed', () => {
    preview?.destroy()
    preview = null
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
      mainWindow = createMainWindow()
      preview = createPreview(mainWindow, store)
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
  generationQueue?.recoverAfterRestart()
})
