import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Button, TextArea, TextField } from 'react-aria-components'
import { MinusIcon, PlusIcon, ArrowsPointingOutIcon, ChatBubbleLeftEllipsisIcon, QueueListIcon, WrenchScrewdriverIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { anchorIsVisible, layoutFocusedMarkers, type FocusedAnchorRect } from './focusedMarkerLayout'

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
  | { readonly source: string; readonly type: 'selection'; readonly page: string; readonly locationId: string; readonly clickedLabel: string; readonly usedAncestor: boolean; readonly rect: FocusedAnchorRect | null }
  | { readonly source: string; readonly type: 'selection-unmappable'; readonly page: string; readonly clickedLabel: string }
  | { readonly source: string; readonly type: 'selection-cancelled'; readonly page: string }
  | { readonly source: string; readonly type: 'focused-anchors'; readonly page: string; readonly anchors: readonly { readonly id: string; readonly locationId: string; readonly rect: FocusedAnchorRect }[] }

function validAnchorRect(value: unknown): value is FocusedAnchorRect {
  if (!value || typeof value !== 'object') return false
  const rect = value as Record<string, unknown>
  return ['left', 'top', 'right', 'bottom', 'width', 'height', 'viewportWidth', 'viewportHeight'].every((key) => typeof rect[key] === 'number' && Number.isFinite(rect[key]) && Math.abs(rect[key]) <= 100_000)
    && (rect.width as number) >= 0 && (rect.height as number) >= 0
    && (rect.right as number) >= (rect.left as number) && (rect.bottom as number) >= (rect.top as number)
    && (rect.viewportWidth as number) > 0 && (rect.viewportHeight as number) > 0
}

function anchoredStyle(rect: FocusedAnchorRect, width: number, estimatedHeight: number, offset = 10): CSSProperties {
  const below = rect.bottom + estimatedHeight + offset <= rect.viewportHeight || rect.top < estimatedHeight + offset
  const left = Math.max(12, Math.min(Math.max(12, rect.viewportWidth - width - 12), rect.left + Math.min(rect.width / 2, width / 2) - width / 2))
  return {
    left: `${left}px`,
    top: `${below ? Math.max(12, rect.bottom + offset) : Math.max(12, rect.top - offset)}px`,
    transform: below ? undefined : 'translateY(-100%)',
  }
}

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
  readonly selectionActive: boolean
  readonly focusedTarget: FocusedTarget | null
  readonly focusedComment: string
  readonly focusedThreads: readonly FocusedEditThread[]
  readonly focusedBusy: boolean
  readonly canSubmitFocused: boolean
  readonly onSelection: (target: FocusedTarget) => void
  readonly onSelectionCancelled: () => void
  readonly onSelectionError: (message: string) => void
  readonly onFocusedCommentChange: (comment: string) => void
  readonly onQueueFocused: () => void
  readonly onSubmitFocused: () => void
  readonly onClearFocused: () => void
  readonly onRemoveFocusedFeedback: (feedbackId: string) => void
}

export interface FocusedEditThreadEntry {
  readonly id: string
  readonly comment: string
  readonly createdAt: string
  readonly state: 'pending' | 'submitted'
  readonly feedbackId?: string
}

export interface FocusedEditThread {
  readonly id: string
  readonly target: FocusedTarget
  readonly entries: readonly FocusedEditThreadEntry[]
}

// Renders the design preview as sandboxed, opaque-origin iframes served over the preview scheme.
// Focused mode shows one page filling the pane (like the Phase 1 preview, just the page itself).
// Canvas mode lays every page out as a device-framed tile on a pan/zoom board honoring the global
// device size and fit. Height (Artboard fit), diagnostics, and current-page reporting arrive from the
// injected shim via postMessage.
export function DesignPreview({ designId, revisionId, token, captureNeeded, pages, viewMode, fit, device, customWidth, customHeight, selectedPage, onSelectPage, onOpenPage, selectionActive, focusedTarget, focusedComment, focusedThreads, focusedBusy, canSubmitFocused, onSelection, onSelectionCancelled, onSelectionError, onFocusedCommentChange, onQueueFocused, onSubmitFocused, onClearFocused, onRemoveFocusedFeedback }: DesignPreviewProps) {
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
  const focusedInput = useRef<HTMLTextAreaElement>(null)
  const [focusedAnchorRects, setFocusedAnchorRects] = useState<Record<string, FocusedAnchorRect>>({})
  const [threadLocationIds, setThreadLocationIds] = useState<Record<string, string>>({})

  const pageUrl = useCallback((path: string) => `omnidesign-preview://revision/${token}/${path.split('/').map(encodeURIComponent).join('/')}`, [token])
  const heightFor = (path: string) => fit === 'fixed' ? dims.height : Math.max(heights[path] ?? dims.height, 120)
  const homePath = pages.find((page) => page.isHome)?.path ?? pages[0]?.path ?? null
  const activePage = selectedPage ?? homePath ?? 'index.html'
  const pagePathSignature = pages.map((page) => page.path).join('|')
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

  const syncSelection = useCallback((frame: HTMLIFrameElement) => {
    try { frame.contentWindow?.postMessage({ type: selectionActive && viewMode === 'focused' ? 'omnidesign-selection-start' : 'omnidesign-selection-stop' }, '*') } catch { /* opaque frame not ready */ }
  }, [selectionActive, viewMode])
  useEffect(() => {
    viewport.current?.querySelectorAll('iframe').forEach((frame) => syncSelection(frame as HTMLIFrameElement))
  }, [syncSelection, activePage])
  useEffect(() => {
    if (focusedTarget || !selectionActive || viewMode !== 'focused') return
    viewport.current?.querySelectorAll('iframe').forEach((frame) => {
      try { (frame as HTMLIFrameElement).contentWindow?.postMessage({ type: 'omnidesign-selection-start' }, '*') } catch { /* opaque frame not ready */ }
    })
  }, [focusedTarget?.locationId])
  useEffect(() => {
    if (focusedTarget) focusedInput.current?.focus()
  }, [focusedTarget?.locationId])

  useEffect(() => {
    let current = true
    setThreadLocationIds({})
    if (!focusedThreads.length) return () => { current = false }
    void window.omnidesign?.preview.locateFocusedTargets({
      designId,
      revisionId,
      token,
      targets: focusedThreads.map((thread) => ({ id: thread.id, target: thread.target })),
    }).then((locations) => {
      if (current) setThreadLocationIds(Object.fromEntries(locations.map((location) => [location.id, location.locationId])))
    }).catch(() => { if (current) setThreadLocationIds({}) })
    return () => { current = false }
  }, [designId, revisionId, token, focusedThreads])

  const expectedFocusedAnchors = useMemo(() => [
    ...(focusedTarget?.locationId ? [{ id: 'editor', locationId: focusedTarget.locationId }] : []),
    ...focusedThreads.filter((thread) => thread.target.path === activePage && threadLocationIds[thread.id]).map((thread) => ({ id: thread.id, locationId: threadLocationIds[thread.id] })),
  ], [focusedTarget?.locationId, focusedThreads, threadLocationIds, activePage])
  const focusedMarkerPlacements = useMemo(() => layoutFocusedMarkers(focusedThreads.flatMap((thread) => {
    const rect = focusedAnchorRects[thread.id]
    return rect && thread.target.path === activePage ? [{ id: thread.id, rect, count: thread.entries.length }] : []
  })), [focusedThreads, focusedAnchorRects, activePage])
  const focusedAnchorSignature = expectedFocusedAnchors.map((item) => `${item.id}:${item.locationId}`).join('|')
  const syncFocusedAnchors = useCallback((frame: HTMLIFrameElement) => {
    try { frame.contentWindow?.postMessage({ type: 'omnidesign-focused-anchors', anchors: expectedFocusedAnchors }, '*') } catch { /* opaque frame not ready yet */ }
  }, [expectedFocusedAnchors])
  useEffect(() => {
    viewport.current?.querySelectorAll('iframe').forEach((frame) => syncFocusedAnchors(frame as HTMLIFrameElement))
    const expectedIds = new Set(expectedFocusedAnchors.map((item) => item.id))
    setFocusedAnchorRects((current) => Object.fromEntries(Object.entries(current).filter(([id]) => expectedIds.has(id))))
  }, [syncFocusedAnchors, activePage, expectedFocusedAnchors])

  // Height / diagnostics / page-sync from the injected shim.
  useEffect(() => {
    let current = true
    const onMessage = (event: MessageEvent) => {
      const data = event.data as ShimMessage | undefined
      if (!data || data.source !== SHIM_SOURCE || !data.page) return
      const frame = [...(viewport.current?.querySelectorAll('iframe') ?? [])].find((candidate) => (candidate as HTMLIFrameElement).contentWindow === event.source) as HTMLIFrameElement | undefined
      if (!frame) return
      if (data.type === 'page' && frame.dataset.page !== data.page) {
        if (viewMode === 'focused' && pages.some((page) => page.path === data.page)) {
          frame.dataset.page = data.page
          if (data.page !== selectedPage) onSelectPage(data.page)
        }
        return
      }
      if (frame.dataset.page !== data.page) return
      if (data.type === 'height') {
        setHeights((current) => current[data.page] === data.height ? current : { ...current, [data.page]: data.height })
      } else if (data.type === 'diagnostic') {
        void window.omnidesign?.preview.reportDiagnostic(designId, revisionId, { level: data.level, message: data.message, source: data.src, line: data.line })
      } else if (data.type === 'page') {
        if (viewMode === 'focused' && data.page !== selectedPage) onSelectPage(data.page)
      } else if (data.type === 'selection' && selectionActive && viewMode === 'focused' && data.page === activePage) {
        if (typeof data.locationId !== 'string' || data.locationId.length > 100 || typeof data.clickedLabel !== 'string' || !data.clickedLabel.trim() || typeof data.usedAncestor !== 'boolean' || data.clickedLabel.length > 200) { onSelectionError('The selected element sent invalid location data.'); return }
        void window.omnidesign?.preview.resolveFocusedTarget({ designId, revisionId, token, page: data.page, locationId: data.locationId, clickedLabel: data.clickedLabel, usedAncestor: data.usedAncestor })
          .then((target) => {
            if (!current) return
            if (!target) { onSelectionError('This element could not be mapped reliably to the current design source.'); return }
            if (data.rect && validAnchorRect(data.rect)) setFocusedAnchorRects((anchors) => ({ ...anchors, editor: data.rect! }))
            onSelection(target)
          })
          .catch(() => { if (current) onSelectionError('This element could not be mapped reliably to the current design source.') })
      } else if (data.type === 'selection-unmappable' && selectionActive) {
        onSelectionError('This element has no source-authored ancestor that OmniDesign can edit reliably.')
      } else if (data.type === 'selection-cancelled' && selectionActive) {
        onSelectionCancelled()
      } else if (data.type === 'focused-anchors' && viewMode === 'focused' && data.page === activePage && Array.isArray(data.anchors) && data.anchors.length <= 201) {
        const expected = new Map(expectedFocusedAnchors.map((item) => [item.id, item.locationId]))
        const next: Record<string, FocusedAnchorRect> = {}
        for (const anchor of data.anchors) {
          if (!anchor || typeof anchor.id !== 'string' || typeof anchor.locationId !== 'string' || expected.get(anchor.id) !== anchor.locationId || !validAnchorRect(anchor.rect)) continue
          next[anchor.id] = anchor.rect
        }
        setFocusedAnchorRects(next)
      }
    }
    window.addEventListener('message', onMessage)
    return () => { current = false; window.removeEventListener('message', onMessage) }
  }, [designId, revisionId, token, viewMode, selectedPage, activePage, selectionActive, focusedAnchorSignature, pagePathSignature, pages, onSelectPage, onSelection, onSelectionCancelled, onSelectionError])

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
                  <iframe data-page={page.path} title={page.title ?? page.path} src={pageUrl(page.path)} sandbox="allow-scripts" referrerPolicy="no-referrer" scrolling={fit === 'fixed' ? 'auto' : 'no'} onLoad={(event) => { syncFrame(event.currentTarget, livePath); syncSelection(event.currentTarget) }} />
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
      <iframe key={`${token}:${activePage}`} data-page={activePage} title={pages.find((page) => page.path === activePage)?.title ?? activePage} src={pageUrl(activePage)} sandbox="allow-scripts" referrerPolicy="no-referrer" onLoad={(event) => { syncFrame(event.currentTarget, livePath); syncSelection(event.currentTarget); syncFocusedAnchors(event.currentTarget) }} />
      {focusedThreads.map((thread, index) => {
        const placement = focusedMarkerPlacements[thread.id]
        if (!placement) return null
        const detailId = `focused-feedback-detail-${thread.id}`
        const pendingCount = thread.entries.filter((entry) => entry.state === 'pending').length
        return <div className="focused-feedback-marker-wrap" data-side={placement.side} key={thread.id} style={{ left: `${placement.left}px`, top: `${placement.top}px`, width: `${placement.width}px` }}>
          <Button className="focused-feedback-marker" data-has-pending={pendingCount > 0 || undefined} style={{ '--marker-point-angle': `${placement.pointAngle}deg`, '--marker-point-x': `${placement.pointX}px`, '--marker-point-y': `${placement.pointY}px` } as CSSProperties} aria-label={`Focused edit thread ${index + 1}, ${thread.entries.length} ${thread.entries.length === 1 ? 'comment' : 'comments'}${pendingCount ? `, ${pendingCount} pending` : ''}`} aria-describedby={detailId}><span className="focused-feedback-marker-point" aria-hidden="true" /><ChatBubbleLeftEllipsisIcon aria-hidden="true" /><span className="focused-feedback-marker-count">{thread.entries.length}</span></Button>
          <div className="focused-feedback-marker-detail" id={detailId} style={{ left: `${placement.detailLeft}px` }}>
            <span><strong>{thread.entries.length === 1 ? 'Focused edit' : `${thread.entries.length} focused edits`}</strong><small>{thread.target.label}</small></span>
            <div className="focused-feedback-thread">
              {thread.entries.map((entry) => <article key={entry.id} data-state={entry.state}>
                <small>{entry.state === 'pending' ? 'Pending' : 'Submitted'}</small>
                <p>{entry.comment}</p>
                {entry.state === 'pending' && entry.feedbackId && <Button className="text-button" onPress={() => onRemoveFocusedFeedback(entry.feedbackId!)}><XMarkIcon aria-hidden="true" />Remove</Button>}
              </article>)}
            </div>
          </div>
        </div>
      })}
      {focusedTarget && focusedAnchorRects.editor && anchorIsVisible(focusedAnchorRects.editor) && <div className="focused-comment-popover" role="dialog" aria-label="Focused feedback" style={anchoredStyle(focusedAnchorRects.editor, 380, 190)}>
        <div className="focused-comment-context"><ChatBubbleLeftEllipsisIcon aria-hidden="true" /><small>{focusedTarget.label} · {focusedTarget.path}:{focusedTarget.startLine}-{focusedTarget.endLine}</small><Button className="icon-button" aria-label="Close focused feedback" onPress={onClearFocused}><XMarkIcon aria-hidden="true" /></Button></div>
        <TextField className="focused-comment-field" aria-label="Feedback for selected element"><TextArea ref={focusedInput} className="focused-comment-input" autoFocus value={focusedComment} placeholder="Describe what should change…" onChange={(event) => onFocusedCommentChange(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Escape') { event.preventDefault(); onClearFocused() }
          else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); if (canSubmitFocused && focusedComment.trim()) onSubmitFocused() }
        }} /></TextField>
        <footer><span>Ctrl/⌘ Enter</span><span><Button className="secondary-action" isDisabled={!focusedComment.trim() || focusedBusy} onPress={onQueueFocused}><QueueListIcon aria-hidden="true" />Queue</Button><Button className="primary-action" isDisabled={!focusedComment.trim() || focusedBusy || !canSubmitFocused} onPress={onSubmitFocused}><WrenchScrewdriverIcon aria-hidden="true" />Submit &amp; fix</Button></span></footer>
      </div>}
    </div>
  )
}
