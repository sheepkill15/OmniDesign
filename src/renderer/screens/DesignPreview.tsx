import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from 'react-aria-components'
import { MinusIcon, PlusIcon, ArrowsPointingOutIcon } from '@heroicons/react/24/outline'

// Must match PREVIEW_MESSAGE_SOURCE in src/electron/workspace/previewShim.ts.
const SHIM_SOURCE = 'omnidesign-preview-shim'

const DEVICE_PRESETS: Record<Exclude<PreviewDevice, 'custom'>, { readonly width: number; readonly height: number }> = {
  phone: { width: 390, height: 844 },
  tablet: { width: 834, height: 1112 },
  desktop: { width: 1280, height: 800 },
}

type ShimMessage =
  | { readonly source: string; readonly type: 'height'; readonly page: string; readonly height: number }
  | { readonly source: string; readonly type: 'page'; readonly page: string }
  | { readonly source: string; readonly type: 'diagnostic'; readonly page: string; readonly level: 'warning' | 'error'; readonly message: string; readonly line: number | null; readonly src: string | null }

function deviceDimensions(device: PreviewDevice, customWidth: number, customHeight: number): { readonly width: number; readonly height: number } {
  return device === 'custom' ? { width: customWidth, height: customHeight } : DEVICE_PRESETS[device]
}

export interface DesignPreviewProps {
  readonly designId: string
  readonly revisionId: string
  readonly token: string
  readonly captureNeeded: boolean
  readonly pages: readonly DesignPage[]
  readonly viewMode: PreviewViewMode
  readonly fit: PreviewFit
  readonly device: PreviewDevice
  readonly customWidth: number
  readonly customHeight: number
  readonly selectedPage: string | null
  readonly onSelectPage: (page: string) => void
  readonly onOpenPage: (page: string) => void
}

// Renders the design preview as sandboxed, opaque-origin iframes served over the preview scheme.
// Focused mode shows one page filling the pane (like the Phase 1 preview, just the page itself).
// Canvas mode lays every page out as a device-framed tile on a pan/zoom board honoring the global
// device size and fit. Height (Artboard fit), diagnostics, and current-page reporting arrive from the
// injected shim via postMessage.
export function DesignPreview({ designId, revisionId, token, captureNeeded, pages, viewMode, fit, device, customWidth, customHeight, selectedPage, onSelectPage, onOpenPage }: DesignPreviewProps) {
  const dims = deviceDimensions(device, customWidth, customHeight)
  const [heights, setHeights] = useState<Record<string, number>>({})
  const [zoom, setZoom] = useState(0.75)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  // Canvas mode keeps every tile loaded but runs the design's animation loops in only one at a time —
  // the hovered one, or the home page by default. The rest are told (over postMessage, via the injected
  // shim) to pause their requestAnimationFrame loops, so switching the active tile never reloads a frame
  // (no white flash) yet a board of many pages does not animate everything at once.
  const [hoveredPath, setHoveredPath] = useState<string | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const capturedRef = useRef<string | null>(null)
  const capturingRef = useRef(false)
  const viewport = useRef<HTMLDivElement>(null)

  const pageUrl = useCallback((path: string) => `omnidesign-preview://revision/${token}/${path.split('/').map(encodeURIComponent).join('/')}`, [token])
  const heightFor = (path: string) => fit === 'fixed' ? dims.height : Math.max(heights[path] ?? dims.height, 120)
  const homePath = pages.find((page) => page.isHome)?.path ?? pages[0]?.path ?? null
  const activePage = selectedPage ?? homePath ?? 'index.html'
  // The one page allowed to animate: the focused page in focused mode, or the hovered/home tile on the
  // canvas. The shim in every other frame is told to pause.
  const livePath = viewMode === 'focused'
    ? activePage
    : (hoveredPath && pages.some((page) => page.path === hoveredPath) ? hoveredPath : homePath)

  // Resume the live frame and pause the rest, without reloading anything.
  const syncFrame = useCallback((frame: HTMLIFrameElement, live: string | null) => {
    try { frame.contentWindow?.postMessage({ type: frame.dataset.page === live ? 'omnidesign-resume' : 'omnidesign-pause' }, '*') } catch { /* frame not ready yet */ }
  }, [])
  useEffect(() => {
    viewport.current?.querySelectorAll('iframe').forEach((frame) => syncFrame(frame as HTMLIFrameElement, livePath))
  }, [livePath, viewMode, pages, syncFrame])

  // Height / diagnostics / page-sync from the injected shim.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as ShimMessage | undefined
      if (!data || data.source !== SHIM_SOURCE || !data.page) return
      if (data.type === 'height') {
        setHeights((current) => current[data.page] === data.height ? current : { ...current, [data.page]: data.height })
      } else if (data.type === 'diagnostic') {
        void window.omnidesign?.preview.reportDiagnostic(designId, revisionId, { level: data.level, message: data.message, source: data.src, line: data.line })
      } else if (data.type === 'page') {
        if (viewMode === 'focused' && data.page !== selectedPage) onSelectPage(data.page)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [designId, revisionId, viewMode, selectedPage, onSelectPage])

  // A fresh revision reprepares the surface: forget stale heights and re-arm thumbnail capture.
  useEffect(() => { setHeights({}); capturedRef.current = null; capturingRef.current = false }, [revisionId, token])

  // Ask every mounted frame to re-measure after a layout-affecting change so Artboard tiles resize
  // instead of keeping a height from the previous device size or fit mode.
  useEffect(() => {
    const frames = viewport.current?.querySelectorAll('iframe') ?? []
    frames.forEach((frame) => { try { (frame as HTMLIFrameElement).contentWindow?.postMessage({ type: 'omnidesign-measure' }, '*') } catch { /* opaque frame not ready */ } })
  }, [fit, device, customWidth, customHeight])

  // Ask main to (re)generate this head revision's thumbnail when it lacks one. Main renders the entry
  // page off-screen and screenshots it, so this does not depend on the view mode, the current page, or
  // the on-screen frame having painted.
  useEffect(() => {
    if (!captureNeeded || capturedRef.current === revisionId || capturingRef.current) return
    const targetRevision = revisionId
    capturingRef.current = true
    void window.omnidesign?.preview.capture(designId, targetRevision)
      .then((captured) => { if (captured) capturedRef.current = targetRevision })
      .finally(() => { capturingRef.current = false })
  }, [designId, revisionId, captureNeeded])

  const onWheel = (event: React.WheelEvent) => {
    if (viewMode !== 'canvas') return
    if (event.ctrlKey || event.metaKey) setZoom((current) => Math.min(2, Math.max(0.2, current - event.deltaY * 0.0015)))
    else setPan((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }))
  }
  const panState = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const onPointerDown = (event: React.PointerEvent) => {
    if (viewMode !== 'canvas' || event.button !== 0) return
    // Only pan from the board background — never when the gesture starts on a page frame or a control.
    if ((event.target as HTMLElement).closest('.preview-tile-frame, .preview-tile-label, .preview-canvas-controls')) return
    event.preventDefault()
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    panState.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
  }
  const onPointerMove = (event: React.PointerEvent) => {
    if (!panState.current) return
    setPan({ x: panState.current.panX + (event.clientX - panState.current.x), y: panState.current.panY + (event.clientY - panState.current.y) })
  }
  const endPan = () => { panState.current = null }
  const resetView = () => { setZoom(0.75); setPan({ x: 0, y: 0 }) }

  // Hovering a tile (after it settles briefly, to avoid activating every tile during a fast sweep)
  // makes that one the single live tile.
  const armHover = (path: string) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHoveredPath(path), 140)
  }
  const cancelHover = () => { if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null } }
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current) }, [])

  if (!pages.length) return <div className="preview-empty"><p>Preview appears after the first valid revision.</p></div>

  if (viewMode === 'canvas') {
    return (
      <div className="preview-canvas" ref={viewport} data-panning={panState.current ? true : undefined} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPan} onPointerCancel={endPan}>
        <div className="preview-board" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          {pages.map((page) => {
            const isLive = page.path === livePath
            return (
              <figure className="preview-tile" data-device={device} data-paused={!isLive || undefined} key={page.path} style={{ width: `${dims.width}px` }} onPointerEnter={() => armHover(page.path)} onPointerLeave={cancelHover}>
                <div className="preview-tile-chrome" data-device={device} aria-hidden="true">
                  {device === 'phone' || device === 'tablet'
                    ? <span className="preview-chrome-notch" />
                    : <><span className="preview-chrome-dots"><i /><i /><i /></span><span className="preview-chrome-title">{page.title ?? page.path}</span>{!isLive && <span className="preview-tile-paused">Paused</span>}</>}
                </div>
                <div className="preview-tile-frame" style={{ height: `${heightFor(page.path)}px` }}>
                  {/* Every tile stays loaded; the shim pauses/resumes its animation loops over
                      postMessage (see the sync effect), so switching the live tile never reloads. */}
                  <iframe data-page={page.path} title={page.title ?? page.path} src={pageUrl(page.path)} sandbox="allow-scripts" referrerPolicy="no-referrer" scrolling={fit === 'fixed' ? 'auto' : 'no'} onLoad={(event) => syncFrame(event.currentTarget, livePath)} />
                </div>
                <figcaption className="preview-tile-label" title="Double-click to open in focused view" onDoubleClick={() => onOpenPage(page.path)}><span className="preview-tile-name">{page.title ?? page.path}</span>{page.isHome && <span className="preview-tile-home">Home</span>}</figcaption>
              </figure>
            )
          })}
        </div>
        <div className="preview-canvas-controls" role="group" aria-label="Canvas zoom">
          <Button className="icon-button" aria-label="Zoom out" onPress={() => setZoom((current) => Math.max(0.2, current - 0.1))}><MinusIcon aria-hidden="true" /></Button>
          <span className="preview-zoom-value">{Math.round(zoom * 100)}%</span>
          <Button className="icon-button" aria-label="Zoom in" onPress={() => setZoom((current) => Math.min(2, current + 0.1))}><PlusIcon aria-hidden="true" /></Button>
          <Button className="icon-button" aria-label="Reset view" onPress={resetView}><ArrowsPointingOutIcon aria-hidden="true" /></Button>
        </div>
      </div>
    )
  }

  // Focused mode: the selected page fills the pane, exactly like opening the HTML file itself.
  return (
    <div className="preview-focused-fill" ref={viewport}>
      <iframe key={`${token}:${activePage}`} data-page={activePage} title={pages.find((page) => page.path === activePage)?.title ?? activePage} src={pageUrl(activePage)} sandbox="allow-scripts" referrerPolicy="no-referrer" onLoad={(event) => syncFrame(event.currentTarget, livePath)} />
    </div>
  )
}
