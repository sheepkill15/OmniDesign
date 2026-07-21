import { describe, expect, it } from 'vitest'
import { captureConsoleDiagnostic, captureLoadDiagnostic } from './previewDiagnostics.js'

describe('preview diagnostics', () => {
  it('keeps browser warnings and errors while ignoring informational console output', () => {
    expect(captureConsoleDiagnostic(1, 'Informational message', 0, '')).toBeNull()
    expect(captureConsoleDiagnostic(2, 'Deprecated feature', 4, 'omnidesign-preview://revision/token')).toMatchObject({ kind: 'console', level: 'warning', line: 4 })
    expect(captureConsoleDiagnostic(3, 'Uncaught TypeError: broken', 9, 'omnidesign-preview://revision/token')).toMatchObject({ kind: 'runtime', level: 'error', line: 9 })
  })

  it('normalizes main-frame load failures for persistence', () => {
    expect(captureLoadDiagnostic(-2, 'ERR_FAILED', 'omnidesign-preview://revision/token')).toEqual({
      kind: 'load', level: 'error', message: 'Preview failed to load (-2): ERR_FAILED', source: 'omnidesign-preview://revision/token', line: null,
    })
  })
})
