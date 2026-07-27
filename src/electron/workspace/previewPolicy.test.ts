import { describe, expect, it } from 'vitest'
import { isAllowedPreviewNetworkUrl, isAllowedPreviewResourceUrl, isAllowedPreviewUrl, previewContentSecurityPolicy } from './previewPolicy.js'

describe('preview security policy', () => {
  it('serves the top-level revision document only from the dedicated origin', () => {
    expect(isAllowedPreviewUrl('omnidesign-preview://revision/token')).toBe(true)
    expect(isAllowedPreviewUrl('https://example.com')).toBe(false)
    expect(isAllowedPreviewUrl('file:///C:/secret.txt')).toBe(false)
    expect(isAllowedPreviewUrl('omnidesign-preview://other/token')).toBe(false)
  })

  it('allows allowlisted HTTPS styles, fonts, and plugins as subresources but blocks local files and other hosts', () => {
    expect(isAllowedPreviewResourceUrl('omnidesign-preview://revision/token')).toBe(true)
    expect(isAllowedPreviewResourceUrl('https://fonts.googleapis.com/css2?family=Inter')).toBe(true)
    expect(isAllowedPreviewResourceUrl('https://cdn.jsdelivr.net/npm/pkg/x.js')).toBe(true)
    expect(isAllowedPreviewResourceUrl('https://images.unsplash.com/photo-1.jpg')).toBe(true)
    expect(isAllowedPreviewResourceUrl('data:font/woff2;base64,AAAA')).toBe(true)
    expect(isAllowedPreviewResourceUrl('file:///C:/secret.txt')).toBe(false)
    expect(isAllowedPreviewResourceUrl('http://insecure.example.com/a.js')).toBe(false)
    // A non-allowlisted HTTPS host is now blocked — this is the exfiltration channel the allowlist closes.
    expect(isAllowedPreviewResourceUrl('https://attacker.example.com/log?data=secret')).toBe(false)
  })

  it('restricts external styles and scripts to the allowlisted hosts and prevents form submission', () => {
    const policy = previewContentSecurityPolicy()
    // The blanket scheme-only `https:` source (space-delimited) is gone; only the curated hosts remain.
    expect(policy).not.toContain(' https: ')
    expect(policy).toContain("script-src 'unsafe-inline' 'unsafe-eval' https://fonts.googleapis.com")
    expect(policy).toContain('https://cdn.jsdelivr.net')
    expect(policy).toContain("style-src 'unsafe-inline' https://fonts.googleapis.com")
    expect(policy).toContain("base-uri 'none'")
    expect(policy).toContain("form-action 'none'")
  })

  it('defaults frame-ancestors to none but allows the trusted renderer origin to embed the preview', () => {
    // Phase 1 native view: no embedding at all.
    expect(previewContentSecurityPolicy()).toContain("frame-ancestors 'none'")
    // Phase 2 in-DOM iframes: the packaged renderer (file:) or dev origin may embed it.
    expect(previewContentSecurityPolicy('file:')).toContain('frame-ancestors file:')
    expect(previewContentSecurityPolicy('http://127.0.0.1:5173 file:')).toContain('frame-ancestors http://127.0.0.1:5173 file:')
  })

  it('denies programmatic network egress (fetch/XHR/WebSocket) from the untrusted preview', () => {
    expect(previewContentSecurityPolicy()).toContain("connect-src 'none'")
  })

  it('enforces the resource allowlist at the session request layer while keeping the Vite renderer available', () => {
    expect(isAllowedPreviewNetworkUrl('https://images.unsplash.com/photo-1.jpg')).toBe(true)
    expect(isAllowedPreviewNetworkUrl('https://attacker.example.com/beacon')).toBe(false)
    expect(isAllowedPreviewNetworkUrl('http://127.0.0.1:5173/src/renderer/main.tsx', 'http://127.0.0.1:5173')).toBe(true)
    expect(isAllowedPreviewNetworkUrl('http://127.0.0.1:5174/other', 'http://127.0.0.1:5173')).toBe(false)
  })
})
