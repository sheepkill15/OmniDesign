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
  private suspended = false
  private lastBounds: Rectangle | null = null
  private designId: string | null = null
  private revisionId: string | null = null
  private token: string | null = null
  private popWindow: BrowserWindow | null = null
  private suppressPopNotify = false

  public constructor(
    private readonly window: BrowserWindow,
    private readonly onDiagnostic: (designId: string, revisionId: string, diagnostic: Omit<PreviewDiagnostic, 'id' | 'createdAt'>) => void,
    private readonly onThumbnail: (designId: string, revisionId: string, png: Uint8Array) => void,
    private readonly onPoppedIn: (designId: string) => void = () => undefined,
  ) {
    this.previewSession = session.fromPartition(partition)
    this.previewSession.setPermissionCheckHandler(() => false)
    this.previewSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    this.previewSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !isAllowedPreviewResourceUrl(details.url) }))
    if (this.previewSession.protocol.isProtocolHandled('omnidesign-preview')) this.previewSession.protocol.unhandle('omnidesign-preview')
    void this.previewSession.protocol.handle('omnidesign-preview', (request) => this.handleRequest(request.url))
  }

  // Dock the preview inside the main window at the given bounds. Any popped-out window is closed first
  // so the single shared view moves back into the docked layout.
  public show(designId: string, revisionId: string, files: RevisionFiles, bounds: Rectangle): void {
    if (this.window.isDestroyed()) return
    const view = this.ensureView()
    if (view.webContents.isDestroyed()) return
    this.closePopWindow()
    this.loadDocument(designId, revisionId, files)
    this.suspended = false
    this.lastBounds = bounds
    if (!this.attached) {
      this.window.contentView.addChildView(view)
      this.attached = true
    }
    view.setVisible(true)
    view.setBounds(bounds)
  }

  // Detach the docked preview from the window while a trusted-UI overlay is open, then re-attach it.
  // Detaching (rather than only hiding) is deliberate: the preview is a second web contents in the
  // window, and leaving it attached lets it contend for focus with the trusted renderer, which breaks
  // focus-driven overlay behavior (React Aria menu hover/keyboard). The renderer shows a captured still
  // frame in its place so there is no visible gap.
  public setSuspended(suspended: boolean): void {
    if (!this.view || this.view.webContents.isDestroyed() || this.window.isDestroyed()) return
    if (suspended) {
      if (!this.attached || this.suspended) return
      this.window.contentView.removeChildView(this.view)
      this.attached = false
      this.suspended = true
    } else {
      if (!this.suspended) return
      this.window.contentView.addChildView(this.view)
      this.attached = true
      this.suspended = false
      this.view.setVisible(true)
      if (this.lastBounds) this.view.setBounds(this.lastBounds)
    }
  }

  // Capture the docked preview's current frame so the renderer can show it as a still image while the
  // native layer is suspended, avoiding any visible gap. Returns null when no docked preview is shown.
  public async freeze(): Promise<string | null> {
    if (!this.attached || this.suspended || !this.view || this.view.webContents.isDestroyed()) return null
    try {
      const image = await this.view.webContents.capturePage()
      if (image.isEmpty()) return null
      return image.toDataURL()
    } catch {
      return null
    }
  }

  // Move the shared preview view into a dedicated top-level window, leaving the main workspace free for
  // the conversation. The view keeps its loaded revision as it moves between windows.
  public popOut(designId: string, revisionId: string, files: RevisionFiles): void {
    if (this.window.isDestroyed()) return
    const view = this.ensureView()
    if (view.webContents.isDestroyed()) return
    if (this.attached) {
      if (!this.window.isDestroyed()) this.window.contentView.removeChildView(view)
      this.attached = false
    }
    this.suspended = false
    this.loadDocument(designId, revisionId, files)
    if (this.popWindow && !this.popWindow.isDestroyed()) {
      this.fitPopWindow()
      return
    }
    const popWindow = new BrowserWindow({
      width: 960,
      height: 720,
      minWidth: 320,
      minHeight: 240,
      title: 'OmniDesign preview',
      backgroundColor: '#151315',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    })
    view.setVisible(true)
    this.popWindow = popWindow
    popWindow.setMenuBarVisibility(false)
    popWindow.contentView.addChildView(view)
    popWindow.on('resize', () => this.fitPopWindow())
    popWindow.on('closed', () => {
      const wasProgrammatic = this.suppressPopNotify
      this.suppressPopNotify = false
      this.popWindow = null
      if (!wasProgrammatic && this.designId) this.onPoppedIn(this.designId)
    })
    this.fitPopWindow()
  }

  public resize(bounds: Rectangle): void {
    this.lastBounds = bounds
    if (this.attached && !this.suspended && this.view && !this.view.webContents.isDestroyed()) this.view.setBounds(bounds)
  }

  public hide(): void {
    this.closePopWindow()
    this.suspended = false
    if (!this.attached || !this.view) return
    if (!this.window.isDestroyed()) this.window.contentView.removeChildView(this.view)
    this.attached = false
  }

  public discard(): void {
    this.hide()
    this.documents.clear()
    this.designId = null
    this.revisionId = null
    this.token = null
    if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.close()
    this.view = null
  }

  public destroy(): void {
    this.hide()
    if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.close()
    this.view = null
  }

  private loadDocument(designId: string, revisionId: string, files: RevisionFiles): void {
    const view = this.view
    if (!view || view.webContents.isDestroyed()) return
    if (this.designId === designId && this.revisionId === revisionId) return
    const token = randomUUID()
    this.documents.clear()
    this.documents.set(token, files)
    this.token = token
    this.designId = designId
    this.revisionId = revisionId
    void view.webContents.loadURL(`omnidesign-preview://revision/${token}/index.html`)
  }

  private fitPopWindow(): void {
    if (!this.popWindow || this.popWindow.isDestroyed() || !this.view || this.view.webContents.isDestroyed()) return
    const [width, height] = this.popWindow.getContentSize()
    this.view.setBounds({ x: 0, y: 0, width, height })
  }

  // Close the popped-out window without reporting it as a user-initiated pop-in.
  private closePopWindow(): void {
    const popWindow = this.popWindow
    if (!popWindow) return
    this.suppressPopNotify = true
    this.popWindow = null
    if (this.view && !popWindow.isDestroyed()) popWindow.contentView.removeChildView(this.view)
    if (!popWindow.isDestroyed()) popWindow.destroy()
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
    view.webContents.on('console-message', (details) => {
      const diagnostic = captureConsoleDiagnostic(details.level, details.message, details.lineNumber, details.sourceId)
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
    // A freshly attached view may not be painted yet on the first load after creation, so capturePage
    // can return an empty frame. Retry briefly until Chromium produces a real frame, and never persist
    // an empty image (which is what previously left the thumbnail blank until the app was reopened).
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (token !== this.token || !this.view || this.view.webContents.isDestroyed()) return
      try {
        const image = await this.view.webContents.capturePage()
        if (token !== this.token || !this.view || this.view.webContents.isDestroyed()) return
        if (!image.isEmpty()) {
          this.onThumbnail(designId, revisionId, image.resize({ width: 320 }).toPNG())
          return
        }
      } catch {
        // A preview can be replaced or destroyed while Chromium is producing its capture.
      }
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
  }
}
