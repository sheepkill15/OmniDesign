import { randomUUID } from 'node:crypto'
import { BrowserWindow, session, WebContentsView } from 'electron'
import type { Rectangle, Session } from 'electron'
import { isAllowedPreviewResourceUrl, isAllowedPreviewUrl, previewContentSecurityPolicy } from './previewPolicy.js'
import { captureConsoleDiagnostic, captureLoadDiagnostic } from './previewDiagnostics.js'
import type { RevisionFiles } from './designRepository.js'
import type { PreviewDiagnostic } from './contracts.js'

function contentTypeFor(relativePath: string): string {
  if (relativePath.endsWith('.css')) return 'text/css; charset=utf-8'
  if (relativePath.endsWith('.js')) return 'text/javascript; charset=utf-8'
  return 'text/html; charset=utf-8'
}

const partition = 'omnidesign-preview'

export class PreviewController {
  private readonly documents = new Map<string, RevisionFiles>()
  private readonly previewSession: Session
  private view: WebContentsView | null = null
  private attached = false
  private designId: string | null = null
  private revisionId: string | null = null
  private token: string | null = null

  public constructor(
    private readonly window: BrowserWindow,
    private readonly onDiagnostic: (designId: string, revisionId: string, diagnostic: Omit<PreviewDiagnostic, 'id' | 'createdAt'>) => void,
    private readonly onThumbnail: (designId: string, revisionId: string, png: Uint8Array) => void,
  ) {
    this.previewSession = session.fromPartition(partition)
    this.previewSession.setPermissionCheckHandler(() => false)
    this.previewSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    this.previewSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !isAllowedPreviewResourceUrl(details.url) }))
    if (this.previewSession.protocol.isProtocolHandled('omnidesign-preview')) this.previewSession.protocol.unhandle('omnidesign-preview')
    void this.previewSession.protocol.handle('omnidesign-preview', (request) => this.handleRequest(request.url))
  }

  public show(designId: string, revisionId: string, files: RevisionFiles, bounds: Rectangle): void {
    if (this.window.isDestroyed()) return
    const view = this.ensureView()
    if (view.webContents.isDestroyed()) return
    const token = randomUUID()
    this.documents.clear()
    this.documents.set(token, files)
    this.token = token
    this.designId = designId
    this.revisionId = revisionId
    if (!this.attached) {
      this.window.contentView.addChildView(view)
      this.attached = true
    }
    view.setBounds(bounds)
    void view.webContents.loadURL(`omnidesign-preview://revision/${token}/index.html`)
  }

  public resize(bounds: Rectangle): void {
    if (this.attached && this.view && !this.view.webContents.isDestroyed()) this.view.setBounds(bounds)
  }

  public hide(): void {
    if (!this.attached || !this.view) return
    if (!this.window.isDestroyed()) this.window.contentView.removeChildView(this.view)
    this.attached = false
  }

  public destroy(): void {
    this.hide()
    if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.close()
    this.view = null
  }

  private ensureView(): WebContentsView {
    if (this.view && !this.view.webContents.isDestroyed()) return this.view
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        session: this.previewSession,
      },
    })
    view.setBackgroundColor('#151315')
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    view.webContents.on('will-navigate', (event, url) => {
      if (!isAllowedPreviewUrl(url)) event.preventDefault()
    })
    view.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      const diagnostic = captureConsoleDiagnostic(level, message, line, sourceId)
      if (diagnostic) this.recordDiagnostic(diagnostic)
    })
    view.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (isMainFrame && errorCode !== -3) this.recordDiagnostic(captureLoadDiagnostic(errorCode, errorDescription, validatedUrl))
    })
    view.webContents.on('did-finish-load', () => { void this.captureThumbnail() })
    this.view = view
    return view
  }

  private handleRequest(url: string): Response {
    if (!isAllowedPreviewUrl(url)) return new Response('Not found', { status: 404 })
    // pathname is /<token>/<relative file path>, e.g. /<token>/index.html or /<token>/.build/tailwind.css
    const [token, ...pathSegments] = new URL(url).pathname.replace(/^\/+/, '').split('/')
    const relativePath = pathSegments.join('/') || 'index.html'
    const content = token ? this.documents.get(token)?.[relativePath] : undefined
    if (content === undefined) return new Response('Not found', { status: 404 })
    return new Response(content, {
      headers: {
        'Content-Type': contentTypeFor(relativePath),
        'Content-Security-Policy': previewContentSecurityPolicy(),
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  private recordDiagnostic(diagnostic: Omit<PreviewDiagnostic, 'id' | 'createdAt'>): void {
    if (this.designId && this.revisionId) this.onDiagnostic(this.designId, this.revisionId, diagnostic)
  }

  private async captureThumbnail(): Promise<void> {
    const view = this.view
    if (!this.designId || !this.revisionId || !this.token || !view || view.webContents.isDestroyed()) return
    const token = this.token
    const designId = this.designId
    const revisionId = this.revisionId
    try {
      const image = await view.webContents.capturePage()
      if (token !== this.token || view.webContents.isDestroyed()) return
      this.onThumbnail(designId, revisionId, image.resize({ width: 320 }).toPNG())
    } catch {
      // A preview can be replaced or destroyed while Chromium is producing its capture.
    }
  }
}
