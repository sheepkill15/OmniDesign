import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron'
import path from 'node:path'
import { isProviderId, ProviderService } from '../provider/providerService.js'
import type { ProviderPrompt } from '../provider/types.js'
import {
  createDesignRequestSchema,
  cloneProjectRequestSchema,
  designIdRequestSchema,
  exportRequestSchema,
  generateRequestSchema,
  generationJobIdRequestSchema,
  generationSelectionSchema,
  generationStageLabel,
  previewRequestSchema,
  projectIdRequestSchema,
  reconnectProjectRequestSchema,
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

const developmentServerUrl = process.env.VITE_DEV_SERVER_URL
const testUserDataDirectory = process.env.OMNIDESIGN_USER_DATA_DIR
const providers = new ProviderService()
let mainWindow: BrowserWindow | null = null
let preview: PreviewController | null = null
let workspace: WorkspaceService | null = null
let workspaceStore: WorkspaceStore | null = null
let generationQueue: GenerationQueue | null = null
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
    && typeof request.prompt === 'string' && request.prompt.length <= 100_000
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

// Persist a permanent, chronological record of the major generation milestones for the design's
// conversation history, then forward the live activity to the renderer. Consecutive activities that
// share a stage (for example the many streaming "generating" updates from an agent) collapse into a
// single milestone so the history stays readable.
function recordActivity(activity: GenerationActivity): void {
  if (workspaceStore && lastPersistedStageByDesign.get(activity.designId) !== activity.stage) {
    lastPersistedStageByDesign.set(activity.designId, activity.stage)
    try {
      workspaceStore.addGenerationStep(activity.designId, activity.stage, generationStageLabel(activity.stage), activity.detail || null)
    } catch {
      // The design may have been removed while a late activity arrived; the live event below is enough.
    }
  }
  sendGenerationActivity(activity)
}

function createPreview(window: BrowserWindow, store: WorkspaceStore): PreviewController {
  return new PreviewController(
    window,
    (designId, revisionId, diagnostic) => {
      store.addPreviewDiagnostic(designId, revisionId, diagnostic)
      window.webContents.send('preview:diagnostic', { designId, revisionId })
    },
    (designId, revisionId, png) => {
      store.saveThumbnail(designId, revisionId, png)
      window.webContents.send('preview:thumbnail', { designId, revisionId })
    },
    (designId) => {
      if (!window.isDestroyed()) window.webContents.send('preview:popped-in', { designId })
    },
  )
}

function registerIpc(): void {
  ipcMain.handle('providers:discover', (event) => {
    authorize(event)
    return providers.discover()
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
  ipcMain.handle('workspace:create', async (event, value: unknown) => {
    authorize(event)
    const request = createDesignRequestSchema.parse(value)
    const selection = { providerId: request.providerId, modelId: request.modelId, effort: request.effort ?? null }
    const target = { projectId: request.projectId ?? null, sourceProjectPath: request.sourceProjectPath ?? null }
    if (request.providerId === 'mock') {
      const design = await requireWorkspace().createDesign(request.prompt, recordActivity, target)
      requireWorkspace().rememberSelection(design.id, selection)
      return requireWorkspace().getDesign(design.id) ?? design
    }
    const design = requireWorkspace().createAgentDesignShell(request.prompt, recordActivity, target)
    requireWorkspace().rememberSelection(design.id, selection)
    requireGenerationQueue().enqueue(design.id, request.prompt, request.providerId, request.modelId, request.effort)
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
  ipcMain.handle('workspace:list-trash', (event) => { authorize(event); return requireWorkspace().listTrash() })
  ipcMain.handle('workspace:clone-project', async (event, value: unknown) => {
    authorize(event)
    const request = cloneProjectRequestSchema.parse(value)
    return requireWorkspace().cloneProject(request.remoteUrl, request.destinationPath, (detail) => {
      if (!event.sender.isDestroyed()) event.sender.send('workspace:clone-activity', detail)
    })
  })
  ipcMain.handle('workspace:reconnect-project', (event, value: unknown) => {
    authorize(event)
    const request = reconnectProjectRequestSchema.parse(value)
    return requireWorkspace().reconnectProject(request.projectId, request.sourceProjectPath)
  })
  ipcMain.handle('workspace:convert-project-to-standalone', (event, value: unknown) => {
    authorize(event); return requireWorkspace().convertProjectToStandalone(projectIdRequestSchema.parse(value).projectId)
  })
  ipcMain.handle('workspace:trash', (event, value: unknown) => {
    authorize(event)
    const request = trashItemRequestSchema.parse(value)
    if (request.kind === 'project') requireWorkspace().moveProjectToTrash(request.id)
    else requireWorkspace().moveDesignToTrash(request.id)
  })
  ipcMain.handle('workspace:restore-trash', (event, value: unknown) => {
    authorize(event)
    const request = trashItemRequestSchema.parse(value)
    return requireWorkspace().restoreTrashItem(request.kind, request.id)
  })
  ipcMain.handle('workspace:purge-trash', (event, value: unknown) => {
    authorize(event)
    const request = trashItemRequestSchema.parse(value)
    requireWorkspace().purgeTrashItem(request.kind, request.id)
  })
  ipcMain.handle('workspace:generate', (event, value: unknown) => {
    authorize(event)
    const request = generateRequestSchema.parse(value)
    requireWorkspace().rememberSelection(request.designId, { providerId: request.providerId, modelId: request.modelId, effort: request.effort ?? null })
    requireGenerationQueue().enqueue(request.designId, request.prompt, request.providerId, request.modelId, request.effort)
    return requireWorkspace().getDesign(request.designId)
  })
  ipcMain.handle('workspace:cancel-generation', (event, value: unknown) => {
    authorize(event)
    return requireGenerationQueue().cancel(generationJobIdRequestSchema.parse(value).jobId)
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
    requireWorkspace().saveDraft(request.designId, request.draft)
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
      requireWorkspace().prepareGenerationWorkspace(job.designId)
      if (job.providerId === 'mock') {
        await requireWorkspace().generate(job.designId, job.prompt, onActivity, undefined, false, signal, 3)
        return
      }
      if (signal.aborted) throw new Error('Generation was cancelled.')
      onActivity({ designId: job.designId, stage: 'generating', detail: `Starting ${job.providerId} in the design's Git repository.` })
      const reply = await providers.runDesignAgent({
        requestId: job.id,
        providerId: job.providerId,
        modelId: job.modelId,
        ...(job.effort ? { effort: job.effort } : {}),
        prompt: job.prompt,
        signal,
        workspacePath: requireWorkspace().getDesignRepositoryPath(job.designId),
      }, (activity) => {
        onActivity({ designId: job.designId, stage: 'generating', detail: activity.detail ?? activity.label })
      })
      if (signal.aborted) throw new Error('Generation was cancelled.')
      await requireWorkspace().saveAgentWorkspaceResult(job.designId, job.prompt, reply.providerId, reply.modelId, reply.response, onActivity)
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
