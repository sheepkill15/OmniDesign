import { describe, expect, it } from 'vitest'
import { isAllowedPreviewResourceUrl, isAllowedPreviewUrl, previewContentSecurityPolicy } from './previewPolicy.js'

describe('preview security policy', () => {
  it('serves the top-level revision document only from the dedicated origin', () => {
    expect(isAllowedPreviewUrl('omnidesign-preview://revision/token')).toBe(true)
    expect(isAllowedPreviewUrl('https://example.com')).toBe(false)
    expect(isAllowedPreviewUrl('file:///C:/secret.txt')).toBe(false)
    expect(isAllowedPreviewUrl('omnidesign-preview://other/token')).toBe(false)
  })

  it('allows external HTTPS styles, fonts, and plugins as subresources but blocks local files', () => {
    expect(isAllowedPreviewResourceUrl('omnidesign-preview://revision/token')).toBe(true)
    expect(isAllowedPreviewResourceUrl('https://fonts.googleapis.com/css2?family=Inter')).toBe(true)
    expect(isAllowedPreviewResourceUrl('data:font/woff2;base64,AAAA')).toBe(true)
    expect(isAllowedPreviewResourceUrl('file:///C:/secret.txt')).toBe(false)
    expect(isAllowedPreviewResourceUrl('http://insecure.example.com/a.js')).toBe(false)
  })

  it('permits external styles and scripts while still preventing embedding and form submission', () => {
    const policy = previewContentSecurityPolicy()
    expect(policy).toContain("script-src 'unsafe-inline' 'unsafe-eval' https:")
    expect(policy).toContain("style-src 'unsafe-inline' https:")
    expect(policy).toContain("base-uri 'none'")
    expect(policy).toContain("form-action 'none'")
    expect(policy).toContain("frame-ancestors 'none'")
  })

  it('denies programmatic network egress (fetch/XHR/WebSocket) from the untrusted preview', () => {
    expect(previewContentSecurityPolicy()).toContain("connect-src 'none'")
  })
})
