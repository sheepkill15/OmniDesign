import { BrowserWindow } from 'electron'
import type { Session } from 'electron'
import type { PreviewContentServer } from './previewServer.js'
import type { RevisionFiles } from './designRepository.js'
import { findingsForPage, type RevisionPageAudit, type RevisionQualityFinding } from './revisionQuality.js'

const CAPTURE_WIDTH = 1280
const CAPTURE_HEIGHT = 900
const THUMBNAIL_WIDTH = 320
const QUALITY_WIDTHS = [390, CAPTURE_WIDTH] as const

export interface RevisionCaptureResult {
  readonly png: Uint8Array | null
  readonly findings: readonly RevisionQualityFinding[]
  readonly checked: boolean
}

/** Renders every page in an isolated off-screen window, records deterministic quality findings, and captures the entry-page thumbnail. */
export class ThumbnailCapturer {
  private queue: Promise<unknown> = Promise.resolve()

  public constructor(private readonly previewSession: Session, private readonly server: PreviewContentServer) {}

  public capture(designId: string, revisionId: string, files: RevisionFiles, entryPage: string): Promise<RevisionCaptureResult> {
    const run = this.queue.then(() => this.captureOne(designId, revisionId, files, entryPage))
    this.queue = run.catch(() => undefined)
    return run
  }

  private async captureOne(designId: string, revisionId: string, files: RevisionFiles, entryPage: string): Promise<RevisionCaptureResult> {
    const token = this.server.register(designId, revisionId, files)
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
    const findings: RevisionQualityFinding[] = []
    let png: Uint8Array | null = null
    try {
      window.showInactive()
      const pages = Object.keys(files).filter((path) => /\.html?$/i.test(path)).sort((left, right) => left.localeCompare(right))
      for (const page of pages) {
        try {
          await window.webContents.loadURL(`omnidesign-preview://revision/${token}/${page.split('/').map(encodeURIComponent).join('/')}`)
          try { await window.webContents.executeJavaScript("window.postMessage({ type: 'omnidesign-resume' }, '*')") } catch { /* keep inspecting static content */ }
          await new Promise((resolve) => setTimeout(resolve, 400))
          for (const [widthIndex, width] of QUALITY_WIDTHS.entries()) {
            window.setContentSize(width, CAPTURE_HEIGHT)
            await new Promise((resolve) => setTimeout(resolve, 120))
            const audit = await window.webContents.executeJavaScript(`(() => {
              const controlName = (element) => {
                const labelledBy = element.getAttribute('aria-labelledby')
                const labelledText = labelledBy ? labelledBy.split(/\\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ').trim() : ''
                const label = element.labels ? Array.from(element.labels).map((candidate) => candidate.textContent || '').join(' ').trim() : ''
                return element.getAttribute('aria-label') || labelledText || label || element.getAttribute('alt') || element.getAttribute('title') || element.textContent?.trim() || ''
              }
              const controls = Array.from(document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="link"]'))
              const images = Array.from(document.images)
              return {
                viewportWidth: document.documentElement.clientWidth,
                documentWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
                hasMain: Boolean(document.querySelector('main, [role="main"]')),
                hasHeading: Boolean(document.querySelector('h1')),
                hasLanguage: Boolean(document.documentElement.lang.trim()),
                hasViewportMeta: Boolean(document.querySelector('meta[name="viewport"]')),
                unnamedControlCount: controls.filter((element) => !controlName(element)).length,
                brokenImageCount: images.filter((image) => image.complete && image.naturalWidth === 0).length,
              }
            })()`) as RevisionPageAudit
            findings.push(...findingsForPage(page, audit, widthIndex === 0))
          }
          if (page === entryPage) {
            await new Promise((resolve) => setTimeout(resolve, 260))
            for (let attempt = 0; attempt < 6; attempt += 1) {
              if (window.isDestroyed()) break
              const image = await window.webContents.capturePage()
              if (!image.isEmpty()) { png = image.resize({ width: THUMBNAIL_WIDTH }).toPNG(); break }
              await new Promise((resolve) => setTimeout(resolve, 200))
            }
          }
        } catch {
          findings.push({ level: 'error', message: 'The page could not be rendered for visual quality checks.', source: page, line: null })
        }
      }
      return { png, findings, checked: true }
    } catch {
      return { png: null, findings: [], checked: false }
    } finally {
      if (!window.isDestroyed()) window.destroy()
    }
  }
}
