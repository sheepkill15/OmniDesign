import { describe, expect, it } from 'vitest'
import { captureConsoleDiagnostic, captureLoadDiagnostic } from './previewDiagnostics.js'

describe('preview diagnostics', () => {
  it('keeps browser warnings and errors while ignoring informational console output', () => {
    expect(captureConsoleDiagnostic(1, 'Informational message', 0, '')).toBeNull()
    expect(captureConsoleDiagnostic(2, 'Deprecated feature', 4, 'omnidesign-preview://revision/token')).toMatchObject({ kind: 'console', level: 'warning', line: 4 })
    expect(captureConsoleDiagnostic(3, 'Uncaught TypeError: broken', 9, 'omnidesign-preview://revision/token')).toMatchObject({ kind: 'runtime', level: 'error', line: 9 })
    expect(captureConsoleDiagnostic('warning', 'Deprecated feature', 4, 'omnidesign-preview://revision/token')).toMatchObject({ kind: 'console', level: 'warning', line: 4 })
    expect(captureConsoleDiagnostic(2, '%cElectron Security Warning (Insecure Content-Security-Policy)', 2, 'node:electron/js2c/renderer_init')).toBeNull()
  })

  it('strips the volatile preview token so the same error dedupes across reloads', () => {
    const first = captureConsoleDiagnostic(3, 'Uncaught Error: boom', 5, 'omnidesign-preview://revision/aaa-111/index.html')
    const second = captureConsoleDiagnostic(3, 'Uncaught Error: boom', 5, 'omnidesign-preview://revision/bbb-222/index.html')
    expect(first?.source).toBe('omnidesign-preview://revision/index.html')
    expect(first?.source).toBe(second?.source)
    // Non-preview sources (e.g. an external script) are left untouched.
    expect(captureConsoleDiagnostic(3, 'Uncaught Error', 5, 'https://cdn.example.com/lib.js')?.source).toBe('https://cdn.example.com/lib.js')
  })

  it('normalizes main-frame load failures for persistence', () => {
    expect(captureLoadDiagnostic(-2, 'ERR_FAILED', 'omnidesign-preview://revision/token')).toEqual({
      kind: 'load', level: 'error', message: 'Preview failed to load (-2): ERR_FAILED', source: 'omnidesign-preview://revision/token', line: null,
    })
  })
})
