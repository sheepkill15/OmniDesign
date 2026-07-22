import type { PreviewDiagnostic } from './contracts.js'

type CapturedPreviewDiagnostic = Omit<PreviewDiagnostic, 'id' | 'createdAt'>

export function captureConsoleDiagnostic(level: number | 'info' | 'warning' | 'error' | 'debug', message: string, line: number, source: string): CapturedPreviewDiagnostic | null {
  const severity = typeof level === 'number' ? level : ({ debug: 0, info: 1, warning: 2, error: 3 } as const)[level]
  if (severity < 2) return null
  return {
    kind: /^uncaught\b/i.test(message) ? 'runtime' : 'console',
    level: severity >= 3 ? 'error' : 'warning',
    message,
    source: source || null,
    line: line > 0 ? line : null,
  }
}

export function captureLoadDiagnostic(errorCode: number, errorDescription: string, validatedUrl: string): CapturedPreviewDiagnostic {
  return { kind: 'load', level: 'error', message: `Preview failed to load (${errorCode}): ${errorDescription}`, source: validatedUrl || null, line: null }
}
