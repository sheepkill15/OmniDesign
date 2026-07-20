import { randomUUID } from 'node:crypto'
import { BrowserWindow, session, WebContentsView } from 'electron'
import type { Rectangle } from 'electron'
import { isAllowedPreviewUrl, previewContentSecurityPolicy } from './previewPolicy.js'

const partition = 'omnidesign-preview'

export class PreviewController {
  private readonly documents = new Map<string, string>()
  private readonly view: WebContentsView
  private attached = false

  public constructor(private readonly window: BrowserWindow) {
    const previewSession = session.fromPartition(partition)
    previewSession.setPermissionCheckHandler(() => false)
    previewSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    previewSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !isAllowedPreviewUrl(details.url) }))
    if (previewSession.protocol.isProtocolHandled('omnidesign-preview')) previewSession.protocol.unhandle('omnidesign-preview')
    void previewSession.protocol.handle('omnidesign-preview', (request) => this.handleRequest(request.url))

    this.view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        session: previewSession,
      },
    })
    this.view.setBackgroundColor('#151315')
    this.view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    this.view.webContents.on('will-navigate', (event, url) => {
      if (!isAllowedPreviewUrl(url)) event.preventDefault()
    })
  }

  public show(html: string, bounds: Rectangle): void {
    const token = randomUUID()
    this.documents.clear()
    this.documents.set(token, html)
    if (!this.attached) {
      this.window.contentView.addChildView(this.view)
      this.attached = true
    }
    this.view.setBounds(bounds)
    void this.view.webContents.loadURL(`omnidesign-preview://revision/${token}`)
  }

  public resize(bounds: Rectangle): void {
    if (this.attached) this.view.setBounds(bounds)
  }

  public hide(): void {
    if (!this.attached) return
    this.window.contentView.removeChildView(this.view)
    this.attached = false
  }

  public destroy(): void {
    this.hide()
    this.view.webContents.close()
  }

  private handleRequest(url: string): Response {
    if (!isAllowedPreviewUrl(url)) return new Response('Not found', { status: 404 })
    const token = new URL(url).pathname.slice(1)
    const html = this.documents.get(token)
    if (!html) return new Response('Not found', { status: 404 })
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': previewContentSecurityPolicy(),
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }
}
