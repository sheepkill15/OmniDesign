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
  canInstall(): string | null
  beforeInstall(): void
  onStateChange?(state: UpdateState): void
  updater?: UpdateClient
  logger?: UpdateLogger
}

export type UpdateState =
  | { readonly kind: 'disabled' }
  | { readonly kind: 'idle' | 'checking' }
  | { readonly kind: 'downloading'; readonly percent: number }
  | { readonly kind: 'ready'; readonly version: string; readonly blockedReason: string | null }
  | { readonly kind: 'failed'; readonly message: string }

const defaultLogger: UpdateLogger = {
  warn(message, error) {
    console.warn(message, error)
  },
}

export function shouldEnableUpdates(isPackaged: boolean, platform: NodeJS.Platform): boolean {
  return isPackaged && platform === 'win32'
}

export class UpdateService {
  private readonly updater: UpdateClient
  private readonly logger: UpdateLogger
  private started = false
  private state: UpdateState

  private readonly handleError = (error: unknown) => {
    this.logger.warn('OmniDesign update failed.', error)
    this.setState({ kind: 'failed', message: error instanceof Error ? error.message : 'The update could not be downloaded.' })
  }

  private readonly handleChecking = () => this.setState({ kind: 'checking' })
  private readonly handleAvailable = () => this.setState({ kind: 'downloading', percent: 0 })
  private readonly handleProgress = (progress: { percent?: unknown }) => {
    const percent = typeof progress.percent === 'number' && Number.isFinite(progress.percent) ? Math.max(0, Math.min(100, Math.round(progress.percent))) : 0
    this.setState({ kind: 'downloading', percent })
  }

  private readonly handleDownloaded = (info: { version?: unknown }) => {
    const version = typeof info.version === 'string' && info.version ? info.version : 'the latest version'
    this.setState({ kind: 'ready', version, blockedReason: null })
  }

  constructor(private readonly options: UpdateServiceOptions) {
    this.updater = options.updater ?? (electronUpdater.autoUpdater as unknown as UpdateClient)
    this.logger = options.logger ?? defaultLogger
    this.state = options.enabled ? { kind: 'idle' } : { kind: 'disabled' }
  }

  getState(): UpdateState { return this.state }

  install(): UpdateState {
    if (this.state.kind !== 'ready') return this.state
    const blockedReason = this.options.canInstall()
    if (blockedReason) {
      this.setState({ ...this.state, blockedReason })
      return this.state
    }
    this.options.beforeInstall()
    this.updater.quitAndInstall(false, true)
    return this.state
  }

  retry(): void {
    if (!this.options.enabled || this.state.kind !== 'failed') return
    this.setState({ kind: 'checking' })
    void this.updater.checkForUpdates().catch(this.handleError)
  }

  start(): void {
    if (!this.options.enabled || this.started) return
    this.started = true
    this.updater.autoDownload = true
    this.updater.autoInstallOnAppQuit = true
    this.updater.on('error', this.handleError)
    this.updater.on('checking-for-update', this.handleChecking)
    this.updater.on('update-available', this.handleAvailable)
    this.updater.on('download-progress', this.handleProgress)
    this.updater.on('update-downloaded', this.handleDownloaded)
    this.setState({ kind: 'checking' })
    void this.updater.checkForUpdates().catch((error: unknown) => {
      this.logger.warn('OmniDesign could not check GitHub for updates.', error)
      this.setState({ kind: 'failed', message: error instanceof Error ? error.message : 'The update check failed.' })
    })
  }

  stop(): void {
    if (!this.started) return
    this.started = false
    this.updater.removeListener('error', this.handleError)
    this.updater.removeListener('checking-for-update', this.handleChecking)
    this.updater.removeListener('update-available', this.handleAvailable)
    this.updater.removeListener('download-progress', this.handleProgress)
    this.updater.removeListener('update-downloaded', this.handleDownloaded)
  }

  private setState(state: UpdateState): void {
    this.state = state
    this.options.onStateChange?.(state)
  }
}
