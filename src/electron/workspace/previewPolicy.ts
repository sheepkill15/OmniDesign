export const previewScheme = 'omnidesign-preview:'

export function isAllowedPreviewUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === previewScheme && parsed.hostname === 'revision'
  } catch {
    return false
  }
}

export function previewContentSecurityPolicy(): string {
  return [
    "default-src 'none'",
    "style-src 'unsafe-inline'",
    "img-src data: omnidesign-preview:",
    "font-src data: omnidesign-preview:",
    "script-src 'none'",
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
}
