import type { PreviewDiagnostic } from './contracts.js'

type CapturedPreviewDiagnostic = Omit<PreviewDiagnostic, 'id' | 'createdAt'>

export function captureConsoleDiagnostic(level: number, message: string, line: number, source: string): CapturedPreviewDiagnostic | null {
  if (level < 2) return null
  return {
    kind: /^uncaught\b/i.test(message) ? 'runtime' : 'console',
    level: level >= 3 ? 'error' : 'warning',
    message,
    source: source || null,
    line: line > 0 ? line : null,
  }
}

export function captureLoadDiagnostic(errorCode: number, errorDescription: string, validatedUrl: string): CapturedPreviewDiagnostic {
  return { kind: 'load', level: 'error', message: `Preview failed to load (${errorCode}): ${errorDescription}`, source: validatedUrl || null, line: null }
}
