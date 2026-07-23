import { createContext } from 'react'

export interface PreviewOverlayController {
  open(): void
  close(): void
}

export const PreviewOverlayContext = createContext<PreviewOverlayController | null>(null)
