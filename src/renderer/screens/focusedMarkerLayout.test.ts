import { describe, expect, it } from 'vitest'
import { anchorIsVisible, layoutFocusedMarkers, type FocusedAnchorRect } from './focusedMarkerLayout'

const anchor = (overrides: Partial<FocusedAnchorRect> = {}): FocusedAnchorRect => ({
  left: 100,
  top: 100,
  right: 180,
  bottom: 140,
  width: 80,
  height: 40,
  viewportWidth: 800,
  viewportHeight: 600,
  ...overrides,
})

describe('focused marker layout', () => {
  it('uses the marker corner facing the element as its teardrop point', () => {
    const below = layoutFocusedMarkers([{ id: 'below', rect: anchor(), count: 1 }]).below
    const above = layoutFocusedMarkers([{ id: 'above', rect: anchor({ top: 560, bottom: 590 }), count: 1 }]).above

    expect(below.side).toBe('below')
    expect(below.point).toMatch(/^top-/)
    expect(above.side).toBe('above')
    expect(above.point).toMatch(/^bottom-/)
  })

  it('moves markers for nearby elements into non-overlapping slots', () => {
    const placements = layoutFocusedMarkers([
      { id: 'first', rect: anchor(), count: 1 },
      { id: 'second', rect: anchor({ left: 104, right: 184 }), count: 1 },
      { id: 'third', rect: anchor({ left: 108, right: 188 }), count: 12 },
    ])
    const boxes = Object.values(placements).map((placement) => ({
      left: placement.left,
      right: placement.left + placement.width,
      top: placement.top,
      bottom: placement.top + 30,
    }))

    expect(boxes).toHaveLength(3)
    for (let first = 0; first < boxes.length; first += 1) {
      for (let second = first + 1; second < boxes.length; second += 1) {
        const overlaps = boxes[first].left < boxes[second].right && boxes[first].right > boxes[second].left && boxes[first].top < boxes[second].bottom && boxes[first].bottom > boxes[second].top
        expect(overlaps).toBe(false)
      }
    }
  })

  it('does not place a marker for an element outside the viewport', () => {
    const offscreen = anchor({ top: 620, bottom: 660 })
    expect(anchorIsVisible(offscreen)).toBe(false)
    expect(layoutFocusedMarkers([{ id: 'hidden', rect: offscreen, count: 1 }])).toEqual({})
  })
})
