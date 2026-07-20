import { describe, expect, it } from 'vitest'
import { isAllowedPreviewUrl, previewContentSecurityPolicy } from './previewPolicy.js'

describe('preview security policy', () => {
  it('allows only the dedicated revision origin', () => {
    expect(isAllowedPreviewUrl('omnidesign-preview://revision/token')).toBe(true)
    expect(isAllowedPreviewUrl('https://example.com')).toBe(false)
    expect(isAllowedPreviewUrl('file:///C:/secret.txt')).toBe(false)
    expect(isAllowedPreviewUrl('omnidesign-preview://other/token')).toBe(false)
  })

  it('denies scripts, network connections, embedding, and form submission', () => {
    const policy = previewContentSecurityPolicy()
    expect(policy).toContain("script-src 'none'")
    expect(policy).toContain("connect-src 'none'")
    expect(policy).toContain("form-action 'none'")
    expect(policy).toContain("frame-ancestors 'none'")
  })
})
