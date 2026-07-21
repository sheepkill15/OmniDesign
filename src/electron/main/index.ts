import { app, BrowserWindow, dialog, ipcMain, protocol } from 'electron'
import path from 'node:path'
import { isProviderId, ProviderService } from '../provider/providerService.js'
import type { ProviderPrompt } from '../provider/types.js'
import {
  createDesignRequestSchema,
  designIdRequestSchema,
  exportRequestSchema,
  generateRequestSchema,
  generationJobIdRequestSchema,
  previewRequestSchema,
  saveDraftRequestSchema,
  saveLayoutRequestSchema,
  selectRevisionRequestSchema,
  themeSchema,
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
let generationQueue: GenerationQueue | null = null

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
  ipcMain.handle('workspace:create', (event, value: unknown) => {
    authorize(event)
    const request = createDesignRequestSchema.parse(value)
    return requireWorkspace().createDesign(request.prompt, sendGenerationActivity)
  })
  ipcMain.handle('workspace:generate', (event, value: unknown) => {
    authorize(event)
    const request = generateRequestSchema.parse(value)
    requireGenerationQueue().enqueue(request.designId, request.prompt)
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
  ipcMain.handle('preview:show', (event, value: unknown) => {
    authorize(event)
    const request = previewRequestSchema.parse(value)
    const design = requireWorkspace().getDesign(request.designId)
    const revision = design?.revisions.find((candidate) => candidate.id === request.revisionId)
    if (!revision) throw new Error('Revision not found.')
    preview?.show(request.designId, request.revisionId, revision.html, request.bounds)
  })
  ipcMain.handle('preview:resize', (event, value: unknown) => {
    authorize(event)
    preview?.resize(previewRequestSchema.shape.bounds.parse(value))
  })
  ipcMain.handle('preview:hide', (event) => {
    authorize(event)
    preview?.hide()
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
    writeOfflineZip(design, request.revisionId, result.filePath)
    return { canceled: false, filePath: result.filePath }
  })
}

app.enableSandbox()

void app.whenReady().then(() => {
  const store = new WorkspaceStore(path.join(app.getPath('userData'), 'workspace'))
  workspace = new WorkspaceService(store)
  generationQueue = new GenerationQueue(
    store,
    async (job, signal, onActivity) => { await requireWorkspace().generate(job.designId, job.prompt, onActivity, undefined, false, signal, 3) },
    sendGenerationActivity,
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
