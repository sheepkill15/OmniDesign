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

// Curated allowlist of external hosts a preview may load subresources from. Programmatic egress is
// already denied (connect-src 'none'), so the residual exfiltration channel is a plain GET to an
// attacker-chosen host through a resource tag — <img src>, <script src>, an @font-face URL, an external
// stylesheet. Restricting those tags to well-known CDNs, font hosts, and placeholder/stock-image
// services closes arbitrary-host beaconing while still loading the assets generated designs actually
// use. Grow this list deliberately (it is mirrored in the agent contract), and keep it in sync with the
// CSP host-source expressions below. Hosts are matched exactly; there is intentionally no wildcard.
export const PREVIEW_ALLOWED_HOSTS: readonly string[] = [
  // Web fonts
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  // General-purpose script/style CDNs
  'cdn.jsdelivr.net',
  'unpkg.com',
  'cdnjs.cloudflare.com',
  // Placeholder / stock imagery commonly used in generated designs
  'images.unsplash.com',
  'plus.unsplash.com',
  'source.unsplash.com',
  'picsum.photos',
  'fastly.picsum.photos',
  'placehold.co',
  'via.placeholder.com',
]

// Subresources — external styles, web fonts, plugin/library scripts, and images — may load from the
// preview origin itself, inline data URLs, or an allowlisted HTTPS host. Local filesystem (file:),
// non-allowlisted hosts, and any other scheme stay blocked, so a preview can neither read local files
// nor beacon out to an arbitrary origin.
export function isAllowedPreviewResourceUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === previewScheme || parsed.protocol === 'data:') return true
    if (parsed.protocol === 'https:') return PREVIEW_ALLOWED_HOSTS.includes(parsed.hostname)
    return false
  } catch {
    return false
  }
}

/** Network-level counterpart to the preview CSP, with one development-renderer exception. */
export function isAllowedPreviewNetworkUrl(url: string, rendererUrl?: string): boolean {
  try {
    if (rendererUrl && new URL(url).origin === new URL(rendererUrl).origin) return true
  } catch {
    return false
  }
  return isAllowedPreviewResourceUrl(url)
}

// The allowlisted hosts as CSP host-source expressions (e.g. `https://fonts.gstatic.com`).
const allowedHostSources = PREVIEW_ALLOWED_HOSTS.map((host) => `https://${host}`).join(' ')

// `frameAncestors` controls who may embed a preview document. Phase 1 served the preview in a native
// view and set 'none'. From Phase 2 the preview renders inside sandboxed iframes in the trusted
// renderer, so the renderer's own origin must be allowed to embed it — the packaged renderer is a
// file: document, and the dev renderer is its localhost origin. The preview scheme is not web-reachable
// and the frames are opaque-origin (sandbox without allow-same-origin), so this stays contained.
export function previewContentSecurityPolicy(frameAncestors = "'none'"): string {
  return [
    "default-src 'none'",
    // omnidesign-preview: lets each page load its .build/tailwind.css and .build/alpine.js; the
    // allowlisted hosts cover external stylesheets and web-font CSS.
    `style-src 'unsafe-inline' ${allowedHostSources} omnidesign-preview:`,
    `img-src data: ${allowedHostSources} omnidesign-preview:`,
    `font-src data: ${allowedHostSources} omnidesign-preview:`,
    // 'unsafe-eval' is required by Alpine.js v3, whose default build evaluates directive expressions
    // (x-data, @click, etc.) via the Function constructor. Without it Alpine loads but throws on every
    // directive. 'unsafe-inline' covers generated inline scripts and event handlers. Both stay until the
    // Alpine CSP-compatible build lands (Phase 3), which would let the injected shim move to a nonce and
    // these two relaxations drop. The preview is sandboxed (no Node, opaque origin), so this stays
    // contained; external scripts are restricted to the allowlisted CDNs.
    `script-src 'unsafe-inline' 'unsafe-eval' ${allowedHostSources} omnidesign-preview:`,
    // No programmatic network egress from the untrusted preview: fetch/XHR/WebSocket/EventSource/beacon
    // are all denied. This closes the most direct data-exfiltration channel for generated code.
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${frameAncestors}`,
  ].join('; ')
}
