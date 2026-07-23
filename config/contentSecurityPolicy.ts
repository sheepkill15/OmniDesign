export function createContentSecurityPolicy(isDevelopment: boolean): string {
  const scriptSources = isDevelopment ? "'self' 'unsafe-inline'" : "'self'"
  const styleSources = isDevelopment ? "'self' 'unsafe-inline'" : "'self'"
  const connectSources = isDevelopment ? "'self' ws://127.0.0.1:5173" : "'self'"

  return [
    "default-src 'self'",
    `script-src ${scriptSources}`,
    `style-src ${styleSources}`,
    "img-src 'self' data:",
    `connect-src ${connectSources}`,
    // The design preview renders in sandboxed iframes served over the privileged preview scheme; allow
    // the trusted renderer to embed them (their own restrictive CSP + opaque-origin sandbox isolates them).
    'frame-src omnidesign-preview:',
  ].join('; ')
}
