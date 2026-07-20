import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { isProviderId, ProviderService } from '../provider/providerService.js'
import type { ProviderPrompt } from '../provider/types.js'

const developmentServerUrl = process.env.VITE_DEV_SERVER_URL
const providers = new ProviderService()

function isProviderPrompt(value: unknown): value is ProviderPrompt {
  if (typeof value !== 'object' || value === null) return false
  const request = value as Record<string, unknown>
  return isProviderId(request.providerId)
    && typeof request.modelId === 'string' && request.modelId.length > 0
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

app.enableSandbox()

app.whenReady().then(() => {
  ipcMain.handle('providers:discover', (event) => {
    if (!event.senderFrame?.url.startsWith(developmentServerUrl ?? 'file://')) throw new Error('Unauthorized sender.')
    return providers.discover()
  })
  ipcMain.handle('providers:prompt', (event, request: unknown) => {
    if (!event.senderFrame?.url.startsWith(developmentServerUrl ?? 'file://')) throw new Error('Unauthorized sender.')
    if (!isProviderPrompt(request)) throw new Error('Invalid provider request.')
    return providers.prompt(request)
  })
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
