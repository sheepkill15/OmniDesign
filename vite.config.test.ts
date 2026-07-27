import { describe, expect, it } from 'vitest'
import { createContentSecurityPolicy } from './config/contentSecurityPolicy'

describe('content security policy', () => {
  it('allows only the development capabilities required by Vite', () => {
    const policy = createContentSecurityPolicy(true)

    expect(policy).toContain("script-src 'self' 'unsafe-inline'")
    expect(policy).toContain("style-src 'self' 'unsafe-inline'")
    expect(policy).toContain("connect-src 'self' ws://127.0.0.1:5173")
  })

  it('keeps the production renderer policy strict', () => {
    const policy = createContentSecurityPolicy(false)

    expect(policy).toContain("script-src 'self'")
    expect(policy).toContain("style-src 'self'")
    expect(policy).toContain("connect-src 'self'")
    expect(policy).not.toContain("'unsafe-inline'")
    expect(policy).not.toContain('ws://')
  })

  it('lets the trusted renderer embed the sandboxed preview scheme', () => {
    expect(createContentSecurityPolicy(false)).toContain('frame-src omnidesign-preview:')
    expect(createContentSecurityPolicy(true)).toContain('frame-src omnidesign-preview:')
  })
})
