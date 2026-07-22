import type { PreviewDiagnostic } from './contracts.js'

type CapturedPreviewDiagnostic = Omit<PreviewDiagnostic, 'id' | 'createdAt'>

// The preview is served from omnidesign-preview://revision/<token>/… where <token> is regenerated on
// every load. Stripping it keeps a diagnostic's source stable across reloads so the same console error
// dedupes instead of accumulating a fresh copy each time the user switches previews.
export function normalizePreviewSource(source: string): string | null {
  if (!source) return null
  return source.replace(/^(omnidesign-preview:\/\/revision\/)[^/]+\//, '$1')
}

export function captureConsoleDiagnostic(level: number | 'info' | 'warning' | 'error' | 'debug', message: string, line: number, source: string): CapturedPreviewDiagnostic | null {
  const severity = typeof level === 'number' ? level : ({ debug: 0, info: 1, warning: 2, error: 3 } as const)[level]
  if (severity < 2) return null
  if (source.startsWith('node:electron/') && message.includes('Electron Security Warning')) return null
  return {
    kind: /^uncaught\b/i.test(message) ? 'runtime' : 'console',
    level: severity >= 3 ? 'error' : 'warning',
    message,
    source: normalizePreviewSource(source),
    line: line > 0 ? line : null,
  }
}

export function captureLoadDiagnostic(errorCode: number, errorDescription: string, validatedUrl: string): CapturedPreviewDiagnostic {
  return { kind: 'load', level: 'error', message: `Preview failed to load (${errorCode}): ${errorDescription}`, source: normalizePreviewSource(validatedUrl), line: null }
}
