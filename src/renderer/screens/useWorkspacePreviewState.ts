import { useEffect, useState } from 'react'
import type { CanvasViewport } from './DesignPreview'

export function useWorkspacePreviewState(design: OmniDesignDocument) {
  const [revisionPages, setRevisionPages] = useState<RevisionPages | null>(null)
  const [previewToken, setPreviewToken] = useState<string | null>(null)
  const [previewPage, setPreviewPage] = useState<string | null>(design.layout.previewPage)
  const [previewViewMode, setPreviewViewMode] = useState<PreviewViewMode>(design.layout.previewViewMode)
  const [previewFit, setPreviewFit] = useState<PreviewFit>(design.layout.previewFit)
  const [previewDevice, setPreviewDevice] = useState<PreviewDevice>(design.layout.previewDevice)
  const [previewCustomWidth, setPreviewCustomWidth] = useState(design.layout.previewCustomWidth)
  const [previewCustomHeight, setPreviewCustomHeight] = useState(design.layout.previewCustomHeight)
  const [canvasViewport, setCanvasViewport] = useState<CanvasViewport>({ zoom: design.layout.previewZoom, panX: design.layout.previewPanX, panY: design.layout.previewPanY })
  const [selectionActive, setSelectionActive] = useState(false)
  const [focusedTarget, setFocusedTarget] = useState<FocusedTarget | null>(null)
  const [focusedComment, setFocusedComment] = useState('')
  const [customSizeOpen, setCustomSizeOpen] = useState(false)
  const [customWidthDraft, setCustomWidthDraft] = useState(String(design.layout.previewCustomWidth))
  const [customHeightDraft, setCustomHeightDraft] = useState(String(design.layout.previewCustomHeight))
  const [pageRename, setPageRename] = useState<{ readonly path: string; readonly value: string } | null>(null)
  const [comparison, setComparison] = useState<RevisionComparison | null>(null)
  const [comparisonLoading, setComparisonLoading] = useState(false)

  useEffect(() => {
    setPreviewViewMode(design.layout.previewViewMode)
    setPreviewFit(design.layout.previewFit)
    setPreviewDevice(design.layout.previewDevice)
    setPreviewCustomWidth(design.layout.previewCustomWidth)
    setPreviewCustomHeight(design.layout.previewCustomHeight)
    setPreviewPage(design.layout.previewPage)
    setCanvasViewport({ zoom: design.layout.previewZoom, panX: design.layout.previewPanX, panY: design.layout.previewPanY })
  }, [design.id, design.layout.previewViewMode, design.layout.previewFit, design.layout.previewDevice, design.layout.previewCustomWidth, design.layout.previewCustomHeight, design.layout.previewPage, design.layout.previewZoom, design.layout.previewPanX, design.layout.previewPanY])

  useEffect(() => setSelectionActive(false), [design.id])
  useEffect(() => { setFocusedTarget(null); setFocusedComment('') }, [design.id, design.selectedRevisionId, previewPage])
  useEffect(() => { setComparison(null); setComparisonLoading(false) }, [design.id, design.selectedRevisionId])
  useEffect(() => {
    if (previewViewMode === 'canvas') { setFocusedTarget(null); setFocusedComment('') }
  }, [previewViewMode])

  return {
    revisionPages, setRevisionPages,
    previewToken, setPreviewToken,
    previewPage, setPreviewPage,
    previewViewMode, setPreviewViewMode,
    previewFit, setPreviewFit,
    previewDevice, setPreviewDevice,
    previewCustomWidth, setPreviewCustomWidth,
    previewCustomHeight, setPreviewCustomHeight,
    canvasViewport, setCanvasViewport,
    selectionActive, setSelectionActive,
    focusedTarget, setFocusedTarget,
    focusedComment, setFocusedComment,
    customSizeOpen, setCustomSizeOpen,
    customWidthDraft, setCustomWidthDraft,
    customHeightDraft, setCustomHeightDraft,
    pageRename, setPageRename,
    comparison, setComparison,
    comparisonLoading, setComparisonLoading,
  }
}
