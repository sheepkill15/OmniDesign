export const previewScheme = 'omnidesign-preview:'

// The top-level revision document is only ever served from the dedicated preview origin.
export function isAllowedPreviewUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === previewScheme && parsed.hostname === 'revision'
  } catch {
    return false
  }
}

// Subresources — external styles, web fonts, plugin/library scripts, and images — may load from
// HTTPS or inline data URLs, in addition to the preview origin itself. Local filesystem (file:) and
// any other scheme stay blocked so a preview can never read local files.
export function isAllowedPreviewResourceUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === previewScheme || parsed.protocol === 'https:' || parsed.protocol === 'data:'
  } catch {
    return false
  }
}

// `frameAncestors` controls who may embed a preview document. Phase 1 served the preview in a native
// view and set 'none'. From Phase 2 the preview renders inside sandboxed iframes in the trusted
// renderer, so the renderer's own origin must be allowed to embed it — the packaged renderer is a
// file: document, and the dev renderer is its localhost origin. The preview scheme is not web-reachable
// and the frames are opaque-origin (sandbox without allow-same-origin), so this stays contained.
export function previewContentSecurityPolicy(frameAncestors = "'none'"): string {
  return [
    "default-src 'none'",
    // omnidesign-preview: lets each page load its .build/tailwind.css and .build/alpine.js.
    "style-src 'unsafe-inline' https: omnidesign-preview:",
    "img-src data: https: omnidesign-preview:",
    "font-src data: https: omnidesign-preview:",
    // 'unsafe-eval' is required by Alpine.js v3, whose default build evaluates directive expressions
    // (x-data, @click, etc.) via the Function constructor. Without it Alpine loads but throws on every
    // directive. The preview is sandboxed (no Node, isolated session), so this stays contained.
    "script-src 'unsafe-inline' 'unsafe-eval' https: omnidesign-preview:",
    // No programmatic network egress from the untrusted preview: fetch/XHR/WebSocket/EventSource/beacon
    // are all denied. This closes the most direct data-exfiltration channel for generated code. External
    // subresources (fonts, images, plugin scripts, styles) still load via their HTML tags over HTTPS —
    // that remains the Phase 1 asset strategy until designs can carry local assets (deferred), at which
    // point the remaining external-HTTPS grants can be reduced to a strict allowlist.
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${frameAncestors}`,
  ].join('; ')
}
