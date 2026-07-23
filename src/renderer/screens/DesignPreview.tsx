import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
}

// Renders the design preview as sandboxed, opaque-origin iframes served over the preview scheme. Canvas
// mode lays every page out as a device-framed tile on a pan/zoom board; focused mode shows one page
// scaled to fit. Both honor the global device size and fit. Height (for Artboard fit), diagnostics, and
// current-page reporting arrive from the injected shim via postMessage.
export function DesignPreview({ designId, revisionId, token, isHeadRevision, pages, viewMode, fit, device, customWidth, customHeight, selectedPage, onSelectPage }: DesignPreviewProps) {
  const dims = deviceDimensions(device, customWidth, customHeight)
  const [heights, setHeights] = useState<Record<string, number>>({})
  const [zoom, setZoom] = useState(0.75)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [focusScale, setFocusScale] = useState(1)
  const capturedRef = useRef<string | null>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const focusedFrame = useRef<HTMLIFrameElement>(null)

  const pageUrl = useCallback((path: string) => `omnidesign-preview://revision/${token}/${path.split('/').map(encodeURIComponent).join('/')}`, [token])
  const heightFor = (path: string) => fit === 'fixed' ? dims.height : Math.max(heights[path] ?? dims.height, 120)

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
        // Following an in-page link in focused mode keeps the switcher in sync.
        if (viewMode === 'focused' && data.page !== selectedPage) onSelectPage(data.page)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [designId, revisionId, viewMode, selectedPage, onSelectPage])

  // A fresh revision reprepares the surface: forget stale heights and re-arm thumbnail capture.
  useEffect(() => { setHeights({}); capturedRef.current = null }, [revisionId, token])

  // Focused mode scales the device-width page down to fit the pane width (never scales up past 1).
  useLayoutEffect(() => {
    if (viewMode !== 'focused') return
    const element = viewport.current
    if (!element) return
    const measure = () => {
      const available = element.clientWidth - 48
      setFocusScale(available > 0 ? Math.min(1, available / dims.width) : 1)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [viewMode, dims.width])

  // Capture a thumbnail for the head revision once the home page has painted in focused mode.
  const activePage = selectedPage ?? pages.find((page) => page.isHome)?.path ?? pages[0]?.path ?? 'index.html'
  useEffect(() => {
    if (!isHeadRevision || viewMode !== 'focused') return
    const homePath = pages.find((page) => page.isHome)?.path ?? pages[0]?.path
    if (!homePath || activePage !== homePath || capturedRef.current === revisionId) return
    if (!heights[homePath]) return
    const frame = focusedFrame.current
    if (!frame) return
    const rect = frame.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return
    capturedRef.current = revisionId
    void window.omnidesign?.preview.capture(designId, revisionId, { x: Math.max(0, Math.round(rect.x)), y: Math.max(0, Math.round(rect.y)), width: Math.round(rect.width), height: Math.round(rect.height) })
  }, [designId, revisionId, isHeadRevision, viewMode, activePage, heights, pages])

  const onWheel = (event: React.WheelEvent) => {
    if (viewMode !== 'canvas') return
    if (event.ctrlKey || event.metaKey) {
      setZoom((current) => Math.min(2, Math.max(0.2, current - event.deltaY * 0.0015)))
    } else {
      setPan((current) => ({ x: current.x - event.deltaX, y: current.y - event.deltaY }))
    }
  }
  const panState = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const onPointerDown = (event: React.PointerEvent) => {
    if (viewMode !== 'canvas' || event.button !== 0) return
    if ((event.target as HTMLElement).closest('.preview-tile-frame')) return
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    panState.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
  }
  const onPointerMove = (event: React.PointerEvent) => {
    if (!panState.current) return
    setPan({ x: panState.current.panX + (event.clientX - panState.current.x), y: panState.current.panY + (event.clientY - panState.current.y) })
  }
  const endPan = () => { panState.current = null }
  const resetView = () => { setZoom(0.75); setPan({ x: 0, y: 0 }) }

  const tile = (page: DesignPage, framed: boolean) => (
    <figure className="preview-tile" data-device={device} key={page.path} style={{ width: `${dims.width}px` }}>
      <div className="preview-tile-chrome" data-device={device} aria-hidden="true">
        {device === 'desktop' || device === 'custom'
          ? <><span className="preview-chrome-dots"><i /><i /><i /></span><span className="preview-chrome-title">{page.title ?? page.path}</span></>
          : <span className="preview-chrome-notch" />}
      </div>
      <div className="preview-tile-frame" style={{ height: `${heightFor(page.path)}px` }}>
        <iframe
          ref={framed ? undefined : focusedFrame}
          title={page.title ?? page.path}
          src={pageUrl(page.path)}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          scrolling={fit === 'fixed' ? 'auto' : 'no'}
        />
      </div>
      {framed && <figcaption className="preview-tile-label"><Button className="preview-tile-open" onPress={() => onSelectPage(page.path)}>{page.title ?? page.path}{page.isHome && <span className="preview-tile-home">Home</span>}</Button></figcaption>}
    </figure>
  )

  if (!pages.length) {
    return <div className="preview-empty"><p>Preview appears after the first valid revision.</p></div>
  }

  if (viewMode === 'canvas') {
    return (
      <div className="preview-canvas" ref={viewport} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPan} onPointerCancel={endPan}>
        <div className="preview-board" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          {pages.map((page) => tile(page, true))}
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

  const focused = pages.find((page) => page.path === activePage) ?? pages[0]
  const scaledHeight = heightFor(focused.path) * focusScale + 44 * focusScale
  return (
    <div className="preview-focused" ref={viewport}>
      <div className="preview-focused-stage" style={{ width: `${dims.width * focusScale}px`, height: `${scaledHeight}px` }}>
        <div className="preview-focused-scale" style={{ width: `${dims.width}px`, transform: `scale(${focusScale})` }}>
          {tile(focused, false)}
        </div>
      </div>
    </div>
  )
}
