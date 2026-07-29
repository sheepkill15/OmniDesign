export interface FocusedAnchorRect {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly width: number
  readonly height: number
  readonly viewportWidth: number
  readonly viewportHeight: number
}

export interface FocusedMarkerPlacement {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly side: 'above' | 'below'
  readonly point: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  readonly detailLeft: number
}

const MARKER_HEIGHT = 30
const MARKER_GAP = 8
const COLLISION_GAP = 6
const VIEWPORT_INSET = 8

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

export function markerWidthForCount(count: number): number {
  if (count > 99) return 46
  if (count > 9) return 40
  return 34
}

export function anchorIsVisible(rect: FocusedAnchorRect): boolean {
  return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < rect.viewportWidth && rect.top < rect.viewportHeight
}

export function layoutFocusedMarkers(items: readonly { readonly id: string; readonly rect: FocusedAnchorRect; readonly count: number }[]): Readonly<Record<string, FocusedMarkerPlacement>> {
  const placements: Record<string, FocusedMarkerPlacement> = {}
  const occupied: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }[] = []
  for (const item of items) {
    const { rect } = item
    if (!anchorIsVisible(rect)) continue
    const width = markerWidthForCount(item.count)
    const maxLeft = Math.max(VIEWPORT_INSET, rect.viewportWidth - width - VIEWPORT_INSET)
    const maxTop = Math.max(VIEWPORT_INSET, rect.viewportHeight - MARKER_HEIGHT - VIEWPORT_INSET)
    const targetX = clamp(rect.left + rect.width / 2, VIEWPORT_INSET, rect.viewportWidth - VIEWPORT_INSET)
    const preferredSide: 'above' | 'below' = rect.viewportHeight - rect.bottom >= MARKER_HEIGHT + MARKER_GAP || rect.viewportHeight - rect.bottom >= rect.top ? 'below' : 'above'
    const sides: readonly ('above' | 'below')[] = [preferredSide, preferredSide === 'below' ? 'above' : 'below']
    const horizontalSlots = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]
    const candidates: { readonly left: number; readonly top: number; readonly side: 'above' | 'below' }[] = []
    for (const side of sides) {
      const baseTop = side === 'below' ? rect.bottom + MARKER_GAP : rect.top - MARKER_GAP - MARKER_HEIGHT
      for (let row = 0; row < 4; row += 1) {
        const top = clamp(baseTop + (side === 'below' ? row : -row) * (MARKER_HEIGHT + COLLISION_GAP), VIEWPORT_INSET, maxTop)
        for (const slot of horizontalSlots) {
          candidates.push({ left: clamp(targetX - width / 2 + slot * (width + COLLISION_GAP), VIEWPORT_INSET, maxLeft), top, side })
        }
      }
    }
    const chosen = candidates.find((candidate) => !occupied.some((other) =>
      candidate.left < other.right + COLLISION_GAP
      && candidate.left + width + COLLISION_GAP > other.left
      && candidate.top < other.bottom + COLLISION_GAP
      && candidate.top + MARKER_HEIGHT + COLLISION_GAP > other.top)) ?? candidates[0]
    const horizontalPoint = targetX < chosen.left + width / 2 ? 'left' : 'right'
    placements[item.id] = {
      ...chosen,
      width,
      point: `${chosen.side === 'below' ? 'top' : 'bottom'}-${horizontalPoint}` as FocusedMarkerPlacement['point'],
      detailLeft: chosen.left + 300 <= rect.viewportWidth - VIEWPORT_INSET ? 0 : width - 300,
    }
    occupied.push({ left: chosen.left, top: chosen.top, right: chosen.left + width, bottom: chosen.top + MARKER_HEIGHT })
  }
  return placements
}
