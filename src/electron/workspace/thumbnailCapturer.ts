import { BrowserWindow } from 'electron'
import type { Session } from 'electron'
import type { PreviewContentServer } from './previewServer.js'
import type { RevisionFiles } from './designRepository.js'

const CAPTURE_WIDTH = 1280
const CAPTURE_HEIGHT = 900
const THUMBNAIL_WIDTH = 320

/**
 * Renders a revision's entry page as a top-level document in a throwaway, off-screen window and
 * screenshots it. Loading the page top-level (rather than screenshotting the on-screen sandboxed
 * iframe) avoids the out-of-process-iframe and timing pitfalls of capturing the visible preview, so
 * thumbnails are reliable regardless of which view mode or page the user is looking at. Captures are
 * serialized so a burst of revisions does not open many windows at once.
 */
export class ThumbnailCapturer {
  private queue: Promise<unknown> = Promise.resolve()

  public constructor(private readonly previewSession: Session, private readonly server: PreviewContentServer) {}

  public capture(designId: string, revisionId: string, files: RevisionFiles, entryPage: string): Promise<Uint8Array | null> {
    const run = this.queue.then(() => this.captureOne(designId, revisionId, files, entryPage))
    this.queue = run.catch(() => undefined)
    return run
  }

  private async captureOne(designId: string, revisionId: string, files: RevisionFiles, entryPage: string): Promise<Uint8Array | null> {
    const token = this.server.register(designId, revisionId, files)
    // A frameless window positioned far off-screen and shown without focus paints normally (so
    // capturePage works) while staying invisible to the user.
    const window = new BrowserWindow({
      x: -20_000,
      y: -20_000,
      width: CAPTURE_WIDTH,
      height: CAPTURE_HEIGHT,
      show: false,
      frame: false,
      skipTaskbar: true,
      backgroundColor: '#151315',
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, session: this.previewSession },
    })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    try {
      window.showInactive()
      await window.webContents.loadURL(`omnidesign-preview://revision/${token}/${entryPage.split('/').map(encodeURIComponent).join('/')}`)
      // Give fonts, images, and the first paint a moment to settle before the screenshot.
      await new Promise((resolve) => setTimeout(resolve, 500))
      for (let attempt = 0; attempt < 6; attempt += 1) {
        if (window.isDestroyed()) return null
        const image = await window.webContents.capturePage()
        if (!image.isEmpty()) return image.resize({ width: THUMBNAIL_WIDTH }).toPNG()
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
      return null
    } catch {
      return null
    } finally {
      if (!window.isDestroyed()) window.destroy()
    }
  }
}
