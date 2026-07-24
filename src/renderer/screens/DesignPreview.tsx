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
  readonly isHeadRevision: boolean
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
export function DesignPreview({ designId, revisionId, token, isHeadRevision, pages, viewMode, fit, device, customWidth, customHeight, selectedPage, onSelectPage, onOpenPage }: DesignPreviewProps) {
  const dims = deviceDimensions(device, customWidth, customHeight)
  const [heights, setHeights] = useState<Record<string, number>>({})
  const [zoom, setZoom] = useState(0.75)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const capturedRef = useRef<string | null>(null)
  const capturingRef = useRef(false)
  const viewport = useRef<HTMLDivElement>(null)

  const pageUrl = useCallback((path: string) => `omnidesign-preview://revision/${token}/${path.split('/').map(encodeURIComponent).join('/')}`, [token])
  const heightFor = (path: string) => fit === 'fixed' ? dims.height : Math.max(heights[path] ?? dims.height, 120)
  const activePage = selectedPage ?? pages.find((page) => page.isHome)?.path ?? pages[0]?.path ?? 'index.html'

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

  // Capture a thumbnail for the head revision once the home page has painted in focused mode. Only mark
  // the revision captured once main confirms a non-empty frame, so an early empty capture retries.
  useEffect(() => {
    if (!isHeadRevision || viewMode !== 'focused') return
    const homePath = pages.find((page) => page.isHome)?.path ?? pages[0]?.path
    if (!homePath || activePage !== homePath || capturedRef.current === revisionId || capturingRef.current || !heights[homePath]) return
    const frame = viewport.current?.querySelector('iframe')
    if (!frame) return
    const rect = frame.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return
    const targetRevision = revisionId
    capturingRef.current = true
    void window.omnidesign?.preview.capture(designId, targetRevision, { x: Math.max(0, Math.round(rect.x)), y: Math.max(0, Math.round(rect.y)), width: Math.round(rect.width), height: Math.round(rect.height) })
      .then((captured) => { if (captured) capturedRef.current = targetRevision })
      .finally(() => { capturingRef.current = false })
  }, [designId, revisionId, isHeadRevision, viewMode, activePage, heights, pages])

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

  if (!pages.length) return <div className="preview-empty"><p>Preview appears after the first valid revision.</p></div>

  if (viewMode === 'canvas') {
    return (
      <div className="preview-canvas" ref={viewport} data-panning={panState.current ? true : undefined} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPan} onPointerCancel={endPan}>
        <div className="preview-board" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          {pages.map((page) => (
            <figure className="preview-tile" data-device={device} key={page.path} style={{ width: `${dims.width}px` }}>
              <div className="preview-tile-chrome" data-device={device} aria-hidden="true">
                {device === 'phone' || device === 'tablet'
                  ? <span className="preview-chrome-notch" />
                  : <><span className="preview-chrome-dots"><i /><i /><i /></span><span className="preview-chrome-title">{page.title ?? page.path}</span></>}
              </div>
              <div className="preview-tile-frame" style={{ height: `${heightFor(page.path)}px` }}>
                <iframe title={page.title ?? page.path} src={pageUrl(page.path)} sandbox="allow-scripts" referrerPolicy="no-referrer" scrolling={fit === 'fixed' ? 'auto' : 'no'} />
              </div>
              <figcaption className="preview-tile-label" title="Double-click to open in focused view" onDoubleClick={() => onOpenPage(page.path)}><span className="preview-tile-name">{page.title ?? page.path}</span>{page.isHome && <span className="preview-tile-home">Home</span>}</figcaption>
            </figure>
          ))}
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
      <iframe key={`${token}:${activePage}`} title={pages.find((page) => page.path === activePage)?.title ?? activePage} src={pageUrl(activePage)} sandbox="allow-scripts" referrerPolicy="no-referrer" />
    </div>
  )
}
