import * as electronUpdater from 'electron-updater'

interface UpdateClient {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  on(event: string, listener: (...args: any[]) => void): unknown
  removeListener(event: string, listener: (...args: any[]) => void): unknown
  checkForUpdates(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

interface UpdateLogger {
  warn(message: string, error?: unknown): void
}

export interface UpdateServiceOptions {
  enabled: boolean
  promptForRestart(version: string): Promise<boolean>
  beforeInstall(): void
  updater?: UpdateClient
  logger?: UpdateLogger
}

const defaultLogger: UpdateLogger = {
  warn(message, error) {
    console.warn(message, error)
  },
}

export function shouldEnableUpdates(isPackaged: boolean, platform: NodeJS.Platform): boolean {
  return isPackaged && (platform === 'win32' || platform === 'darwin')
}

export class UpdateService {
  private readonly updater: UpdateClient
  private readonly logger: UpdateLogger
  private started = false
  private prompting = false

  private readonly handleError = (error: unknown) => {
    this.logger.warn('OmniDesign update failed.', error)
  }

  private readonly handleDownloaded = (info: { version?: unknown }) => {
    if (this.prompting) return
    this.prompting = true
    const version = typeof info.version === 'string' && info.version ? info.version : 'the latest version'
    void this.options.promptForRestart(version).then((restart) => {
      if (!restart) return
      this.options.beforeInstall()
      this.updater.quitAndInstall(false, true)
    }).catch((error: unknown) => {
      this.logger.warn('OmniDesign could not present the downloaded update.', error)
    }).finally(() => {
      this.prompting = false
    })
  }

  constructor(private readonly options: UpdateServiceOptions) {
    this.updater = options.updater ?? (electronUpdater.autoUpdater as unknown as UpdateClient)
    this.logger = options.logger ?? defaultLogger
  }

  start(): void {
    if (!this.options.enabled || this.started) return
    this.started = true
    this.updater.autoDownload = true
    this.updater.autoInstallOnAppQuit = true
    this.updater.on('error', this.handleError)
    this.updater.on('update-downloaded', this.handleDownloaded)
    void this.updater.checkForUpdates().catch((error: unknown) => {
      this.logger.warn('OmniDesign could not check GitHub for updates.', error)
    })
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    this.updater.removeListener('error', this.handleError)
    this.updater.removeListener('update-downloaded', this.handleDownloaded)
  }
}
